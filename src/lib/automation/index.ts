// Auto-scheduling automation module
export {
  selectNextPAA,
  markPAAAsUsed,
  getPAAQueueStatus,
  renderPAAQuestion,
  selectNextPAACombination,
  getPAACombinationStatus,
} from './paa-selector'

export {
  selectNextLocation,
  markLocationAsUsed,
  getLocationRotationStatus,
  getDefaultLocation,
} from './location-rotator'

export {
  getNextTuesdayOrThursday,
  getNextScheduleDates,
  hasContentForDate,
  autoScheduleForClient,
  runWeeklyAutoSchedule,
} from './auto-scheduler'
