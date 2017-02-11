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
        newTarget: function(creep) {
            if (creep.data.travelRoom) {
                const room = Game.rooms[creep.data.travelRoom];
                return room && (room.storage || room.spawns[0]);
            }
        },
    },
};
mod.selectStrategies = function(actionName) {
    return [mod.strategies.defaultStrategy, mod.strategies[actionName]];
};
