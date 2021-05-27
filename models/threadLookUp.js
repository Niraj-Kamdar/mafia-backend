const {ThreadID} = require("@textile/hub");
getThreads = async(client, threadIdString, roomId) => {
    const threadId = ThreadID.fromString(threadIdString)
    const threads = await client.findByID(threadId, 'threadLookUp', roomId)
    return threads
}

createThreads = async(client, threadIdString, threads) => {
    const threadId = ThreadID.fromString(threadIdString)
    await client.create(threadId, "threadLookUp", [threads])
}

module.exports = {getThreads, createThreads}
