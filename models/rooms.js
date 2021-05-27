const {ThreadID} = require("@textile/hub");
const shuffleSeed = require('shuffle-seed');
// const {PolyRand, PolyAES} = require('poly-crypto');
// const {PublicKey} = require('@textile/hub');
const threadLookUp = require("./threadLookUp");
const playerState = require("./playerState");
const utils = require("./utils");

class Rooms {
    constructor(identity, client, threadIdString, bree) {
        this.identity = identity;
        this.client = client;
        this.threadId = ThreadID.fromString(threadIdString);
        this.bree = bree;
    }

    listRooms = async () => {
        const rooms = await this.client.find(this.threadId, 'rooms', {})
        return rooms
    }

    createRoom = async (playerId) => {
        const villagerThread = (await this.client.newDB()).toString()
        const mafiaThread = (await this.client.newDB()).toString()
        const gameStateThread = (await this.client.newDB()).toString()
        const room = await this.client.create(this.threadId, 'rooms', [{
            phase: "WAITING",
            players: [playerId],
            villagerThread
        }])
        const roomId = room[0]
        await threadLookUp.createThreads(this.client, this.threadId, {
            _id: roomId,
            villagerThread,
            mafiaThread,
            gameStateThread
        })
        await utils.initCollections(this.client, villagerThread, [{name: "chat"}]);
        return {roomId}
    }

    joinRoom = async (roomId, playerId) => {
        const room = await this.getRoom(roomId)
        const playerPublicId = playerId.public.toString()
        if (room.players.length < 8) {
            if (!room.players.includes(playerPublicId)) {
                room.players.push(playerPublicId)
                await this.client.save(this.threadId, "rooms", [room])
            }
        }
        if (room.phase === "WAITING" && room.players.length === 8) {
            const roles = ["MAFIA", "MAFIA", "MAFIA", "VILLAGER", "VILLAGER", "VILLAGER", "DOCTOR", "DETECTIVE"]
            const timestamp = new Date().getTime();
            const shuffledRoles = shuffleSeed.shuffle(roles, timestamp)
            const threads = await threadLookUp.getThreads(this.client, this.threadId.toString(), roomId);
            // const villagerThread = ThreadID.fromString(threads.villagerThread)
            // const gameStateThread = ThreadID.fromString(threads.gameStateThread)

            await utils.initCollections(this.client, threads.villagerThread, [{name: "chat"}]);
            await utils.initCollections(this.client, threads.gameStateThread, [{name: "playerState"}]);
            const players = []
            const messages = []
            // todo: figure out encryption
            for (let i = 0; i < 8; i++) {
                // const hexKey = PolyRand.hex(64)
                const player = {
                    _id: `${i}`,
                    publicId: room.players[i],
                    role: shuffledRoles[i],
                    // key: hexKey,
                    isAlive: true
                }
                players.push(player)
                // const pubKey = PublicKey.fromString(room.players[i])
                // const encryptedRoleString = PolyAES.withKey(hexKey).encrypt(shuffledRoles[i])
                // const encryptedHexKey = await pubKey.encrypt(Buffer.from(hexKey))
                // const encryptedHexKeyString = Buffer.from(encryptedHexKey).toString()
                // const messagePayload = (shuffledRoles[i] === "MAFIA") ? JSON.stringify({
                //     encryptedRole: encryptedRoleString,
                //     encryptedHexKey: encryptedHexKeyString,
                //     mafiaThread: threads.mafiaThread,
                //     role: shuffledRoles[i]
                // }) : JSON.stringify({
                //     encryptedRole: encryptedRoleString,
                //     encryptedHexKey: encryptedHexKeyString,
                //     role: shuffledRoles[i]
                // })
                const message = {
                    subject: "RoleAssignment",
                    message: "",
                    to: room.players[i],
                    from: this.identity.public.toString(),
                    type: "SYSTEM"
                }
                messages.push(message)
            }
            const playerIds = await playerState.addPlayers(this.client, threads.gameStateThread, players)
            const messageIds = await this.client.create(ThreadID.fromString(threads.villagerThread), 'chat', messages)
            await this.updateRoomPhase(roomId)
        }
        if (room.phase !== "WAITING" && room.players.length === 8) {
            throw new Error("Room is full!")
        }
        return {roomId}
    }

    getRoom = async (roomId) => {
        const room = await this.client.findByID(this.threadId, 'rooms', roomId)
        return room
    }

    updateRoomPhase = async (roomId) => {
        const threads = await threadLookUp.getThreads(this.client, this.threadId, roomId)
        this.bree.add([{
            name: roomId,
            path: "./jobs/phaseUpdater.js",
            timeout: 0,
            interval: "1m",
            worker: {
                workerData: {
                    roomId,
                    threads,
                    config: {
                        identity: this.identity.toString(),
                        threadId: this.threadId.toString(),
                    }
                }
            }
        }])
        this.bree.start(roomId)
    }
}

module.exports = {Rooms}
