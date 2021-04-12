const express = require("express");
const hub = require('@textile/hub');
const bodyParser = require("body-parser");
const Graceful = require('@ladjs/graceful');
const Cabin = require('cabin');
const Bree = require('bree');
const morgan = require('morgan');
const cors = require('cors');

const getHub = require("./config/hub");
const modelsFactory = require("./models");

const app = express();
const identity = hub.PrivateKey.fromString(process.env.IDENTITY);
const gameThread = hub.ThreadID.fromString(process.env.GAME_THREAD);

const logger = new Cabin();
const bree = new Bree({
    logger
});
const graceful = new Graceful({ brees: [bree] });

let hubConfig = {};
let models = {};

function errorHandler(callback) {
    if(hubConfig && models){
        return function (req, res, next) {
            callback(req, res, next)
                .catch(next)
        }
    }
}

app.use(bodyParser.json());
app.use(morgan("combined"));
app.use(cors());
app.use(async(req, res, next) => {
    hubConfig = await getHub(identity);
    models.rooms = new modelsFactory.Rooms(identity, hubConfig.client, gameThread, bree);
    next();
})

// Create new room
app.post("/rooms", errorHandler(async(req, res, next) => {
    const playerId = hub.PrivateKey.fromString(req.body.playerId);
    const roomInfo = await models.rooms.createRoom(playerId.public.toString());
    res.json(roomInfo);
}))

// Join an existing room
app.put("/rooms/:roomId", errorHandler(async(req, res, next) => {
    const playerId = hub.PrivateKey.fromString(req.body.playerId);
    const roomId = req.params.roomId;
    const roomInfo = await models.rooms.joinRoom(roomId, playerId);
    res.json(roomInfo);
}))

// kill vote
app.put("/rooms/:roomId/killVote", errorHandler(async(req, res, next) => {
    const playerId = hub.PrivateKey.fromString(req.body.playerId);
    const roomId = req.params.roomId;
    const victimId = req.body.victimId;
    const threads = modelsFactory.threadLookUp.getThreads(hubConfig.client, gameThread, roomId)
    const room = models.rooms.getRoom(roomId)
    const player = modelsFactory.playerState.getPlayer(playerId.public.toString())
    if(room.phase !== "NIGHT"){
        throw new Error("You can only kill during night!")
    } else if (player.role !== "MAFIA"){
        throw new Error("Only mafia can kill a person")
    } else if (!player.isAlive) {
        throw new Error("Only alive mafia can kill")
    } else {
        const gamePhaseName = `NIGHT-${room.currentDay}`
        await modelsFactory.game.killVote(
            hubConfig.client,
            threads.gameStateThread,
            gamePhaseName,
            playerId.public.toString(),
            victimId
        )
        res.json({status: "success"})
    }
}))

// eject vote
app.put("/rooms/:roomId/vote", errorHandler(async(req, res, next) => {
    const playerId = hub.PrivateKey.fromString(req.body.playerId);
    const roomId = req.params.roomId;
    const victimId = req.body.victimId;
    const threads = modelsFactory.threadLookUp.getThreads(hubConfig.client, gameThread, roomId)
    const room = models.rooms.getRoom(roomId)
    const player = modelsFactory.playerState.getPlayer(playerId.public.toString())
    if(room.phase !== "VOTING"){
        throw new Error("You can only vote during voting phase!")
    } else if (!player.isAlive) {
        throw new Error("Only alive player can vote")
    } else {
        const gamePhaseName = `DAY-${room.currentDay}`
        await modelsFactory.game.vote(
            hubConfig.client,
            threads.gameStateThread,
            gamePhaseName,
            playerId.public.toString(),
            victimId
        )
        res.json({status: "success"})
    }
}))

// inspect
app.get("/rooms/:roomId/inspect", errorHandler(async(req, res, next) => {
    const playerId = hub.PrivateKey.fromString(req.query.playerId);
    const roomId = req.params.roomId;
    const victimId = req.query.victimId;
    const threads = modelsFactory.threadLookUp.getThreads(hubConfig.client, gameThread, roomId)
    const room = models.rooms.getRoom(roomId)
    const player = modelsFactory.playerState.getPlayer(playerId.public.toString())
    if(room.phase !== "NIGHT"){
        throw new Error("You can only inspect during night!")
    } else if (player.role !== "DETECTIVE"){
        throw new Error("Only detective can inspect a person")
    } else if (!player.isAlive) {
        throw new Error("You need to be alive to inspect")
    } else {
        const gamePhaseName = `NIGHT-${room.currentDay}`
        const role = await modelsFactory.game.inspect(
            hubConfig.client,
            threads.gameStateThread,
            gamePhaseName,
            playerId.public.toString(),
            victimId
        )
        res.json({victimId, role})
    }
}))

// Heal
app.put("/rooms/:roomId/heal", errorHandler(async(req, res, next) => {
    const playerId = hub.PrivateKey.fromString(req.body.playerId);
    const roomId = req.params.roomId;
    const victimId = req.body.victimId;
    const threads = modelsFactory.threadLookUp.getThreads(hubConfig.client, gameThread, roomId)
    const room = models.rooms.getRoom(roomId)
    const player = modelsFactory.playerState.getPlayer(playerId.public.toString())
    if(room.phase !== "NIGHT"){
        throw new Error("You can only heal during night!")
    } else if (player.role !== "DOCTOR"){
        throw new Error("Only doctor can heal a person")
    } else if (!player.isAlive) {
        throw new Error("You need to be alive to heal someone")
    } else {
        const gamePhaseName = `NIGHT-${room.currentDay}`
        await modelsFactory.game.heal(
            hubConfig.client,
            threads.gameStateThread,
            gamePhaseName,
            playerId.public.toString(),
            victimId
        )
        res.json({status: "success"})
    }
}))

app.get("/rooms/:roomId", errorHandler(async(req, res, next) => {
    await models.rooms.updateRoomPhase(req.params.roomId)
    res.send("success")
}))

app.delete("/rooms/:roomId", errorHandler(async(req, res, next) => {
    bree.stop(req.params.roomId)
    res.send("success")
}))

app.listen(process.env.PORT || 8000, "0.0.0.0", async function(){
    hubConfig = await getHub(identity);
    await modelsFactory.initCollections(
        hubConfig.client,
        gameThread,
        [{name: "rooms"}, {name: "threadLookUp"}]
    );
    models.rooms = new modelsFactory.Rooms(identity, hubConfig.client, gameThread, bree);
    graceful.listen();
    bree.start();
});
