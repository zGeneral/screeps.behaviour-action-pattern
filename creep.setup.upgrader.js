let setup = new Creep.Setup('upgrader');
module.exports = setup;
setup.minControllerLevel = 2;
setup.maxMulti = function(room){
    let multi = 0;
    if( !room.storage || room.storage.store.energy > MIN_STORAGE_ENERGY[room.controller.level])
        multi++;
    if( !room.storage || room.storage.store.energy > ((MAX_STORAGE_ENERGY[room.controller.level]-MIN_STORAGE_ENERGY[room.controller.level])/2)+MIN_STORAGE_ENERGY[room.controller.level])
        multi++;
    if( room.storage && room.storage.store.energy >= MAX_STORAGE_ENERGY[room.controller.level] )
    {
        let surplus = room.storage.store.energy - MAX_STORAGE_ENERGY[room.controller.level];
        multi += Math.ceil( surplus / 20000 ); // one more multi for each 20k surplus (+1)
    }
    let hardLimit = 50;
    return Math.min(11, multi, hardLimit);
};
setup.maxCount = function(room){
    // Don't spawn upgrader if...
    if (    // Room under attack
            room.situation.invasion ||
            // Energy reserves are low
            room.conserveForDefense ||
            // No energy structures built near controller
            (room.structures.container.controller.length + room.structures.links.controller.length) == 0 ||
            // Upgrading blocked -> http://support.screeps.com/hc/en-us/articles/207711889-StructureController#upgradeBlocked
            room.controller.upgradeBlocked
        ) return 0;
    // if there is no energy for the upgrader return 0
    let upgraderEnergy = 0;
    let sumCont = cont => upgraderEnergy += cont.store.energy;
    room.structures.container.controller.forEach(sumCont);
    let sumLink = link => upgraderEnergy += link.energy;
    room.structures.links.controller.forEach(sumLink);
    if( upgraderEnergy === 0 ) return 0;
    if( room.storage ) return Math.max(1, Math.floor((room.storage.store.energy-MAX_STORAGE_ENERGY[room.controller.level]) / 100000));
    // dont spawn a new upgrader while there are construction sites (and no storage)
    if( room.constructionSites.length > 0 ) return 0;
    // if energy on the ground next to source > 700 return 3
    if( room.droppedResources ) {
        let dropped = 0;
        let isSource = pos => room.sources.some(s => s.pos.x === pos.x && s.pos.y === pos.y);
        let countNearSource = resource => {
            if( resource.resourceType === RESOURCE_ENERGY ) {
                if( resource.pos.adjacent.some(isSource) ) dropped += resource.amount;
            }
        };
        room.droppedResources.forEach(countNearSource);
        if(dropped > 700) return 3;
    }
    return 2;
};
setup.default = {
    fixedBody: [WORK, WORK, CARRY, MOVE],
    multiBody: [WORK, WORK, WORK, MOVE],
    minAbsEnergyAvailable: 400,
    minEnergyAvailable: 0.5,
    maxMulti: room => setup.maxMulti(room),
    maxCount: room => setup.maxCount(room),
};
setup.low = {
    fixedBody: [WORK, WORK, CARRY, MOVE],
    multiBody: [WORK, WORK, MOVE],
    minAbsEnergyAvailable: 300,
    minEnergyAvailable: 1,
    maxMulti: room => setup.maxMulti(room),
    maxCount: room => setup.maxCount(room),
};
setup.level8 = {
    fixedBody: [CARRY, MOVE, MOVE, MOVE],
    multiBody: [WORK],
    minAbsEnergyAvailable: 300,
    minEnergyAvailable: 1,
    maxMulti: CONTROLLER_MAX_UPGRADE_PER_TICK / UPGRADE_CONTROLLER_POWER,
    maxCount: 1
};
setup.RCL = {
    1: setup.none,
    2: setup.low,
    3: setup.default,
    4: setup.default,
    5: setup.default,
    6: setup.default,
    7: setup.default,
    8: setup.level8
};
