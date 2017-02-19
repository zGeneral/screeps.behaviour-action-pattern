let mod = {};
module.exports = mod;
mod.minControllerLevel = 2;
mod.name = 'mining';
mod.register = () => {
    // when a new flag has been found (occurs every tick, for each flag)
    Flag.found.on( flag => Task.mining.handleFlagFound(flag) );
    // when a flag has been removed
    Flag.FlagRemoved.on( flagName => Task.mining.handleFlagRemoved(flagName) );
    // a creep starts spawning
    Creep.spawningStarted.on( params => Task.mining.handleSpawningStarted(params) );
    Creep.spawningCompleted.on( creep => Task.mining.handleSpawningCompleted(creep) );
    Creep.died.on( name => Task.mining.handleCreepDied(name));
};
mod.checkFlag = (flag) => {
    if( flag.color == FLAG_COLOR.claim.mining.color && flag.secondaryColor == FLAG_COLOR.claim.mining.secondaryColor ) {
        flag.memory.roomName = flag.pos.roomName;
        flag.memory.task = mod.name;
        return true;
    }
    return false;
};
mod.handleFlagRemoved = flagName => {
    // check flag
    let flagMem = Memory.flags[flagName];
    if( flagMem && flagMem.task === mod.name && flagMem.roomName ){
        // if there is still a mining flag in that room ignore. 
        let flags = FlagDir.filter(FLAG_COLOR.claim.mining, new RoomPosition(25,25,flagMem.roomName), true);
        if( flags && flags.length > 0 ) 
            return;
        else {
            // no more mining in that room. 
            // clear memory
            Task.clearMemory(mod.name, flagMem.roomName);
        }
    }
};
mod.handleFlagFound = flag => {
    // Analyze Flag
    if( Task.mining.checkFlag(flag) ){
        // check if a new creep has to be spawned
        Task.mining.checkForRequiredCreeps(flag);
    }
};
// remove creep from task memory of queued creeps
mod.handleSpawningStarted = params => {
    if ( !params.destiny || !params.destiny.task || params.destiny.task != mod.name )
        return;
    let memory = Task.mining.memory(params.destiny.room);
    if( memory.queued[params.destiny.type] ) memory.queued[params.destiny.type].pop();
    else if( params.destiny.role ) {
        // temporary migration
        if( params.destiny.role == "hauler" ) params.destiny.type = 'remoteHauler';
        else if( params.destiny.role == "miner" ) params.destiny.type = 'remoteMiner';
        else if( params.destiny.role == "worker" ) params.destiny.type = 'remoteWorker';
        memory.queued[params.destiny.type].pop();
    }
    if (params.body) params.body = _.countBy(params.body);
    // save spawning creep to task memory
    memory.spawning[params.destiny.type].push(params);
    // set a timer to make sure we re-validate this spawning entry if it still remains after the creep has spawned
    const nextCheck = memory.nextSpawnCheck[params.destiny.type];
    if (!nextCheck || (Game.time + params.spawnTime) < nextCheck) memory.nextSpawnCheck[params.destiny.type] = Game.time + params.spawnTime + 1;
};
mod.validateSpawning = (roomName, type) => {
    let memory = Task.mining.memory(roomName);
    let spawning = [];
    let minRemaining;
    let _validateSpawning = o => {
        let spawn = Game.spawns[o.spawn];
        if( spawn && ((spawn.spawning && spawn.spawning.name == o.name) || (spawn.newSpawn && spawn.newSpawn.name == o.name))) {
            minRemaining = (!minRemaining || spawn.spawning.remainingTime < minRemaining) ? spawn.spawning.remainingTime : minRemaining;
            spawning.push(o);
        }
    };
    if (memory.spawning[type]) {
        memory.spawning[type].forEach(_validateSpawning);
    }
    memory.spawning[type] = spawning;
    // if we get to this tick without nextCheck getting updated (by handleSpawningCompleted) we need to validate again, it might be stuck.
    memory.nextSpawnCheck[type] = minRemaining ? Game.time + minRemaining : 0;
};
mod.handleSpawningCompleted = creep => {
    if ( !creep.data.destiny || !creep.data.destiny.task || creep.data.destiny.task != mod.name )
        return;
    if( creep.data.destiny.homeRoom ) {
        creep.data.homeRoom = creep.data.destiny.homeRoom;
    }
    // calculate & set time required to spawn and send next substitute creep
    // TODO: implement better distance calculation
    creep.data.predictedRenewal = creep.data.spawningTime + (routeRange(creep.data.homeRoom, creep.data.destiny.room)*50);
    // get task memory
    let memory = Task.mining.memory(creep.data.destiny.room);
    // save running creep to task memory
    memory.running[creep.data.destiny.type].push(creep.name);
    // clean/validate task memory spawning creeps
    Task.mining.validateSpawning(creep.data.destiny.room, creep.data.destiny.type);
};
mod.validateRunning = (roomName, type, name) => {
    // get task memory
    let memory = Task.mining.memory(roomName);
    let running = [];
    let _validateRunning = o => {
        // invalidate dead or old creeps for predicted spawning
        let creep = Game.creeps[o];
        if( !creep || !creep.data ) return;
        // invalidate old creeps for predicted spawning
        // TODO: better distance calculation
        let prediction;
        if( creep.data.predictedRenewal ) prediction = creep.data.predictedRenewal;
        else if( creep.data.spawningTime ) prediction = (creep.data.spawningTime + (routeRange(creep.data.homeRoom, roomName)*50));
        else prediction = (routeRange(creep.data.homeRoom, roomName)+1) * 50;
        if( ( !name || creep.name !== name ) && creep.ticksToLive > prediction ) running.push(o);
    };
    if( memory.running[type] ) {
        memory.running[type].forEach(_validateRunning);
    }
    memory.running[type] = running;
};
// when a creep died (or will die soon)
mod.handleCreepDied = name => {
    // get creep memory
    let mem = Memory.population[name];
    // ensure it is a creep which has been requested by this task (else return)
    if (!mem || !mem.destiny || !mem.destiny.task || mem.destiny.task != mod.name)
        return;
    // clean/validate task memory running creeps
    Task.mining.validateRunning(mem.destiny.room, mem.creepType, name);
};
mod.needsReplacement = (creep) => {
    // this was used below in maxWeight, perhaps it's more accurate?
    // (c.ticksToLive || CREEP_LIFE_TIME) < (50 * travel - 40 + c.data.spawningTime)
    return !creep || (creep.ticksToLive || CREEP_LIFE_TIME) < (creep.data.predictedRenewal || 0);
};
// check if a new creep has to be spawned
mod.checkForRequiredCreeps = (flag) => {
    const roomName = flag.pos.roomName;
    const room = Game.rooms[roomName];
    // Use the roomName as key in Task.memory?
    // Prevents accidentally processing same room multiple times if flags > 1
    let memory = Task.mining.memory(roomName);

    // get number of sources
    let sourceCount;
    // has visibility. get cached property.
    if( room ) sourceCount = room.sources.length;
    // no visibility, but been there before
    else if( Memory.rooms[roomName] && Memory.rooms[roomName].sources ) sourceCount = Memory.rooms[roomName].sources.length;
    // never been there
    else sourceCount = 1;

    // do we need to validate our spawning entries?
    for (const type of ['remoteHauler', 'remoteMiner', 'remoteWorker']) {
        if (memory.nextSpawnCheck[type] && Game.time > memory.nextSpawnCheck[type]) {
            if( DEBUG && TRACE ) trace('Task', {Task:mod.name, roomName, flagName:flag.name, [mod.name]:'Flag.found', 'Flag.found':'revalidating', revalidating:type});
            Task.mining.validateSpawning(roomName, type);
        }
    }

    let countExisting = type => {
        let invalidEntry = false;
        let running = _.map(memory.running[type], n => {
            let c = Game.creeps[n];
            if (!c) invalidEntry = true;
            return c;
        });
        if (invalidEntry) {
            if( DEBUG && TRACE ) trace('Task', {Task:mod.name, roomName, flagName:flag.name, [mod.name]:'Flag.found', 'Flag.found':'revalidating', revalidating:type});
            mod.validateRunning(roomName, type);
            running = _.map(memory.running[type], n => Game.creeps[n]);
        }
        let runningCount = _.filter(running, c => !Task.mining.needsReplacement(c)).length;
        return memory.queued[type].length + memory.spawning[type].length + runningCount;
    };

    let haulerCount = countExisting('remoteHauler');
    let minerCount = countExisting('remoteMiner');
    let workerCount = countExisting('remoteWorker');

    // TODO: calculate creeps by type needed per source / mineral

    if( DEBUG && TRACE ) trace('Task', {Task:mod.name, flagName:flag.name, sourceCount, haulerCount, minerCount, workerCount, [mod.name]:'Flag.found'}, 'checking flag@', flag.pos);

    if(minerCount < sourceCount) {
        if( DEBUG && TRACE ) trace('Task', {Task:mod.name, room:roomName, minerCount,
            minerTTLs: _.map(_.map(memory.running.remoteMiner, n=>Game.creeps[n]), "ticksToLive"), [mod.name]:'minerCount'});

        for(let i = minerCount; i < sourceCount; i++) {
            Task.spawn(
                Task.mining.creep.miner, // creepDefinition
                { // destiny
                    task: mod.name, // taskName
                    targetName: flag.name, // targetName
                    type: Task.mining.creep.miner.behaviour // custom
                }, 
                { // spawn room selection params
                    targetRoom: roomName,
                    minEnergyCapacity: 550,
                    rangeRclRatio: 1,
                },
                creepSetup => { // onQueued callback
                    let memory = Task.mining.memory(creepSetup.destiny.room);
                    memory.queued[creepSetup.behaviour].push({
                        room: creepSetup.queueRoom,
                        name: creepSetup.name
                    });
                }
            );
        }
    }

    // only spawn haulers for sources a miner has been spawned for
    let maxHaulers = Math.ceil(memory.running.remoteMiner.length * REMOTE_HAULER_MULTIPLIER);
    if(haulerCount < maxHaulers && (!memory.capacityLastChecked || Game.time - memory.capacityLastChecked > REMOTE_HAULER_CHECK_INTERVAL)) {
        for(let i = haulerCount; i < maxHaulers; i++) {
            const spawnRoom = mod.strategies.hauler.spawnRoom(roomName);
            if( !spawnRoom ) break;

            // haulers set homeRoom if closer storage exists
            const storageRoom = REMOTE_HAULER_REHOME && mod.strategies.hauler.homeRoom(roomName) || spawnRoom;
            const maxWeight = mod.strategies.hauler.maxWeight(roomName, storageRoom, memory); // TODO Task.strategies
            if( !maxWeight || (i >= 1 && maxWeight < REMOTE_HAULER_MIN_WEIGHT)) {
                memory.capacityLastChecked = Game.time;
                break;
            }

            // spawning a new hauler
            const creepDefinition = _.create(Task.mining.creep.hauler);
            creepDefinition.maxWeight = maxWeight;
            Task.spawn(
                creepDefinition,
                { // destiny
                    task: mod.name, // taskName
                    targetName: flag.name, // targetName
                    type: Task.mining.creep.hauler.behaviour, // custom
                    homeRoom: storageRoom.name
                }, {
                    targetRoom: roomName,
                    explicit: spawnRoom.name,
                },
                creepSetup => { // onQueued callback
                    let memory = Task.mining.memory(creepSetup.destiny.room);
                    memory.queued[creepSetup.behaviour].push({
                        room: creepSetup.queueRoom,
                        name: creepSetup.name,
                        body: _.countBy(creepSetup.parts)
                    });
                }
            );
        }
    }
    if( room && room.constructionSites.length > 0 && workerCount < REMOTE_WORKER_MULTIPLIER) {
        for(let i = workerCount; i < REMOTE_WORKER_MULTIPLIER; i++) {
            Task.spawn(
                Task.mining.creep.worker, // creepDefinition
                { // destiny
                    task: mod.name, // taskName
                    targetName: flag.name, // targetName
                    type: Task.mining.creep.worker.behaviour // custom
                }, 
                { // spawn room selection params
                    targetRoom: roomName,
                    minEnergyCapacity: 600
                },
                creepSetup => { // onQueued callback
                    let memory = Task.mining.memory(creepSetup.destiny.room);
                    memory.queued[creepSetup.behaviour].push({
                        room: creepSetup.queueRoom,
                        name: creepSetup.name
                    });
                }
            );
        }
    }
};
mod.findSpawning = (roomName, type) => {
    let spawning = [];
    _.forEach(Game.spawns, s => {
        if (s.spawning && (_.includes(s.spawning.name, type) || (s.newSpawn && _.includes(s.newSpawn.name, type)))) {
            let c = Population.getCreep(s.spawning.name);
            if (c && c.destiny.room === roomName) {
                let params = {
                    spawn: s.name,
                    name: s.spawning.name,
                    destiny: c.destiny
                };
                spawning.push(params);
            }
        }
    });
    return spawning;
};
mod.findRunning = (roomName, type) => {
    let running = [];
    _.forEach(Game.creeps, c => {
        if (!c.spawning && c.data.creepType === type && c.data && c.data.destiny && c.data.destiny.room === roomName) {
            running.push(c.name);
        }
    });
    return running;
};
mod.memory = key => {
    let memory = Task.memory(mod.name, key);
    if( !memory.hasOwnProperty('queued') ){
        memory.queued = {
            remoteMiner:[],
            remoteHauler:[],
            remoteWorker:[]
        };
    }
    if( !memory.hasOwnProperty('spawning') ){
        memory.spawning = {
            remoteMiner: Task.mining.findSpawning(key, 'remoteMiner'),
            remoteHauler: Task.mining.findSpawning(key, 'remoteHauler'),
            remoteWorker: Task.mining.findSpawning(key, 'remoteWorker')
        };
    }
    if( !memory.hasOwnProperty('running') ){
        memory.running = {
            remoteMiner: Task.mining.findRunning(key, 'remoteMiner'),
            remoteHauler: Task.mining.findRunning(key, 'remoteHauler'),
            remoteWorker: Task.mining.findRunning(key, 'remoteWorker')
        };
    }
    if( !memory.hasOwnProperty('nextSpawnCheck') ){
        memory.nextSpawnCheck = {};
    }
    // temporary migration
    if( memory.queued.miner ){
        memory.queued.remoteMiner = memory.queued.miner;
        delete memory.queued.miner;
    }
    if( memory.queued.hauler ){
        memory.queued.remoteHauler = memory.queued.hauler;
        delete memory.queued.hauler;
    }
    if( memory.queued.worker ){
        memory.queued.remoteWorker = memory.queued.worker;
        delete memory.queued.worker;
    }

    return memory;
};
mod.creep = {
    miner: {
        fixedBody: [MOVE, WORK, WORK, WORK, WORK, WORK],
        multiBody: [MOVE, MOVE, WORK, CARRY],
        maxMulti: 1,
        behaviour: 'remoteMiner',
        queue: 'Medium' // not much point in hauling or working without a miner, and they're a cheap spawn.
    },
    hauler: {
        fixedBody: [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, WORK],
        multiBody: [CARRY, CARRY, MOVE],
        behaviour: 'remoteHauler',
        queue: 'Low'
    },
    worker: {
        fixedBody: [MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, WORK, WORK, WORK],
        multiBody: [], 
        behaviour: 'remoteWorker',
        queue: 'Low'
    }
};
mod.carry = function(roomName, partChange) {
    let memory = Task.mining.memory(roomName);
    memory.carryParts = (memory.carryParts || 0) + (partChange || 0);
    const population = Math.round(mod.carryPopulation(roomName) * 100);
    return `Task.${mod.name}: hauler carry capacity for ${roomName} ${memory.carryParts >= 0 ? 'increased' : 'decreased'} by ${Math.abs(memory.carryParts)}. Currently at ${population}% of desired capacity`;
};
mod.checkCapacity= function(roomName) {
    let checkRoomCapacity = function(roomName, minPopulation, maxDropped) {
        const population = Math.round(mod.carryPopulation(roomName) * 100);
        const room = Game.rooms[roomName];
        let dropped = room ? room.find(FIND_DROPPED_ENERGY): null;
        let message = 'unknown dropped energy, room not visible.';
        let totalDropped = 0;
        if (dropped) {
            totalDropped = _.sum(dropped, d => d.energy);
            message = 'with ' + totalDropped + ' dropped energy.';
        }
        if (population <= minPopulation || totalDropped >= maxDropped) {
            console.log(mod.carry(roomName), message);
            return true;
        }
        return false;
    };
    if (roomName) {
        return checkRoomCapacity(roomName, 100, 0);
    } else {
        let count = 0;
        let total = 0;
        for (const roomName in Memory.tasks.mining) {
            total++;
            if (checkRoomCapacity(roomName, 90, 1000)) count++;
        }
        return `Task.${mod.name} ${count} rooms under-capacity out of ${total}.`;
    }
};
mod.storage = function(roomName, storageRoom) {
    const room = Game.rooms[roomName];
    let memory = Task.mining.memory(roomName);
    if (storageRoom) {
        const was = memory.storageRoom;
        memory.storageRoom = storageRoom;
        return `Task.${mod.name}: room ${roomName}, now sending haulers to ${storageRoom}, (was ${was})`;
    } else if (!memory.storageRoom) {
        return `Task.${mod.name}: room ${roomName}, no custom storage destination`;
    } else if (storageRoom === false) {
        const was = memory.storageRoom;
        delete memory.storageRoom;
        return `Task.${mod.name}: room ${roomName}, cleared custom storage room (was ${was})`;
    } else {
        return `Task.${mod.name}: room ${roomName}, sending haulers to ${memory.storageRoom}`;
    }
};
function haulerCarryToWeight(carry) {
    if( !carry || carry < 0) return 0;
    const multiCarry = _.max([0, carry - 5]);
    return 500 + 150 * _.ceil(multiCarry * 0.5);
}
mod.carryPopulation = function(roomName, travelRoom) {
    // how much more do we need to meet our goals
    const neededWeight = Task.mining.strategies.hauler.maxWeight(roomName, travelRoom, undefined, false, true);
    // how much do we need for this room in total
    const totalWeight = Task.mining.strategies.hauler.maxWeight(roomName, travelRoom, undefined, true, true);
    return 1 - neededWeight / totalWeight;
};
mod.strategies = {
    defaultStrategy: {
        name: `default-${mod.name}`,
    },
    reserve: {
        spawnParams: function(flag) {
            const population = mod.carryPopulation(flag.pos.roomName);

            if( population < REMOTE_RESERVE_HAUL_CAPACITY ) {
                // TODO if this room & all exits are currently reserved (by anyone) then use default to prevent Invaders?
                if( DEBUG && TRACE ) trace('Task', {flagName:flag.name, pos:flag.pos, population, spawnParams:'population', [mod.name]:'spawnParams', Task:mod.name});
                return function() { // TODO how to pass thru partial results?
                    return {count: 0, priority: 'Low'};
                };
            }

            // undefined means use defaults
        }
    },
    hauler: {
        name: `hauler-${mod.name}`,
        homeRoom: function(flagRoomName) {
            // Explicity set by user?
            let memory = Task.mining.memory(flagRoomName);
            if(memory.storageRoom) return Game.rooms[memory.storageRoom];
            // Otherwise, score it
            return Room.bestSpawnRoomFor(flagRoomName);
        },
        spawnRoom: function(flagRoomName) {
            return Room.findSpawnRoom({
                targetRoom: flagRoomName,
                minEnergyCapacity: 500
            });
        },
        maxWeight: function(roomName, travelRoom, memory, ignorePopulation, ignoreQueue) {
            if( !memory ) memory = Task.mining.memory(roomName);
            if( !travelRoom ) travelRoom = mod.strategies.hauler.homeRoom(roomName);
            const existingHaulers = ignorePopulation ? [] : _.map(memory.running.remoteHauler, n=>Game.creeps[n]);
            const queuedHaulers = ignoreQueue ? [] : _.union(memory.queued.remoteHauler, memory.spawning.remoteHauler);
            const room = Game.rooms[roomName];
            // TODO loop per-source, take pinned delivery for route calc
            const travel = routeRange(roomName, travelRoom.name);
            let ept = 10;
            if( room ) {
                ept = 10 * room.sources.length;
            } else if( travel > 3 ) {
                ept = 20; // assume profitable
            }
            // carry = ept * travel * 2 * 50 / 50
            let validHaulers = _.filter(existingHaulers, c => !Task.mining.needsReplacement(c));
            const existingCarry = _.sum(validHaulers, c => (c && c.data && c.data.body) ? c.data.body.carry : 5);
            const queuedCarry = _.sum(queuedHaulers, c => (c && c.body) ? c.body.carry : 5);
            const neededCarry = ept * travel * 2 + (memory.carryParts || 0) - existingCarry - queuedCarry;
            const maxWeight = haulerCarryToWeight(neededCarry);
            if( DEBUG && TRACE ) trace('Task', {Task:mod.name, room: roomName, travelRoom: travelRoom.name,
                haulers: existingHaulers.length + queuedHaulers.length, ept, travel, existingCarry, queuedCarry,
                neededCarry, maxWeight, [mod.name]:'maxWeight'});
            return maxWeight;
        }
    },
};
