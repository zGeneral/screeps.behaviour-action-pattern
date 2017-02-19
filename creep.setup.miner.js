let setup = new Creep.Setup('miner');
module.exports = setup;
setup.minControllerLevel = 1;
setup.default = {
    fixedBody: [WORK, WORK, WORK, WORK, CARRY, MOVE],
    multiBody: [WORK, MOVE],
    minAbsEnergyAvailable: 500,
    minEnergyAvailable: 0.3,
    maxMulti: 2,
    maxCount: room => room.sources.length
};
setup.low = {
    fixedBody: [WORK, WORK, MOVE],
    multiBody: [WORK],
    minAbsEnergyAvailable: 250,
    minEnergyAvailable: 0.9,
    maxMulti: 3,
    maxCount: room => room.sources.length,
};
setup.RCL = {
    1: setup.low,
    2: setup.low,
    3: setup.default,
    4: setup.default,
    5: setup.default,
    6: setup.default,
    7: setup.default,
    8: setup.default
};
