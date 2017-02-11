let mod = {};
module.exports = mod;
mod.name = 'recycler';
mod.run = function(creep) {
    // Assign next Action
    if( !creep.action || creep.action.name === 'idle' ) {
        delete creep.data.targetId;
        delete creep.data.path;
        this.nextAction(creep);
    }

    // Do some work
    if( creep.action && creep.target ) {
        creep.action.step(creep);
    } else {
        logError('Creep without action/activity!\nCreep: ' + creep.name + '\ndata: ' + JSON.stringify(creep.data));
    }
};
mod.nextAction = function(creep) {
    Creep.action.recycling.assign(creep);
};
mod.nextAction = function(creep){
    const priority = [
        // Creep.action.picking, // TODO only energy
        Creep.action.withdrawing,
        Creep.action.uncharging,
        Creep.action.travelling,
        Creep.action.storing,
        Creep.action.feeding,
        ];

    if( !creep.data.travelRoom ) {
        priority.shift();
        priority.shift();
    }

    for(var iAction = 0; iAction < priority.length; iAction++) {
        var action = priority[iAction];
        if(action.isValidAction(creep) &&
            action.isAddableAction(creep) &&
            action.assign(creep)) {
            return;
        }
    }

    if (creep.sum) { // TODO if touching another recycler, just die
        Creep.action.idle.assign(creep); // TODO picking?
    } else {
        Creep.action.recycling.assign(creep);
    }
};
mod.strategies = {
    defaultStrategy: {
        name: `default-${mod.name}`,
    },
    travelling: {
        name: `travelling-${mod.name}`,
        newTarget: function(creep) {
            if (!creep.data.travelRoom) {
                if (creep.data.travelPos) {
                    creep.data.travelRoom = creep.data.travelPos.roomName;
                } else if (creep.room.structures.spawns.length) {
                    return null; // arrived
                } else {
                    // TODO search for closest spawn
                    creep.data.travelRoom = creep.data.homeRoom;
                }
            }
            const room = Game.rooms[creep.data.travelRoom];
            let target = room && (room.storage || room.structures.spawns[0]);
            if (!target) {
                // TODO create flag and place in room
                return creep;
            }
            return target;
        },
    },
};
mod.selectStrategies = function(actionName) {
    return [mod.strategies.defaultStrategy, mod.strategies[actionName]];
};
