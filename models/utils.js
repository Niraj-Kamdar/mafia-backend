const {ThreadID} = require("@textile/hub");
const validators = require('../validators');
const schemas = require('../schemas');

async function createCollection(client, threadId, name, type){
    const schema = schemas[type]
    const writeValidator = validators[type].writeValidator
    await client.newCollection(threadId, { name, schema, writeValidator})
}

async function initCollections(client, threadIdString, expectedCollections){
    const threadId = ThreadID.fromString(threadIdString)
    const collections = await client.listCollections(threadId)
    const collectionSet = new Set(collections.map((collection) => (collection.name)))

    for(const collection of expectedCollections){
        if(!collectionSet.has(collection.name)) {
            const type = collection.hasOwnProperty("type") ? collection.type : collection.name
            await createCollection(client, threadId, collection.name, type)
        }
    }
}

module.exports = {
    createCollection,
    initCollections
}