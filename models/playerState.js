const {ThreadID} = require("@textile/hub");

addPlayers = async(client, threadIdString, players) => {
    const threadId = ThreadID.fromString(threadIdString)
    const playerIds = await client.create(threadId, "playerState", players)
    return playerIds
}

markPlayerDead = async(client, threadIdString, playerId) => {
    const threadId = ThreadID.fromString(threadIdString)
    const player = await client.findByID(threadId, "playerState", playerId)
    player.isAlive = false
    await this.client.save(threadId, "playerState", [player])
}

getPlayer = async(client, threadIdString, playerId) => {
    const threadId = ThreadID.fromString(threadIdString)
    const player = await client.findByID(threadId, "playerState", playerId)
    return player
}

module.exports = {
    addPlayers,
    markPlayerDead,
    getPlayer
}