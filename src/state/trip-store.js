export const tripStore = createTripStore();

function createTripStore() {
  let trips = [];
  let currentTrip = null;
  let currentBases = [];
  let currentDays = [];
  let currentItems = [];

  return {
    getTrips() {
      return trips;
    },
    setTrips(nextTrips) {
      trips = nextTrips;
    },
    prependTrip(trip) {
      trips = [trip, ...trips];
    },
    getCurrentTrip() {
      return currentTrip;
    },
    getCurrentBases() {
      return currentBases;
    },
    getCurrentDays() {
      return currentDays;
    },
    getCurrentItems() {
      return currentItems;
    },
    setCurrentTripBundle(bundle) {
      currentTrip = bundle.trip;
      currentBases = bundle.bases;
      currentDays = bundle.days;
      currentItems = bundle.items;
    },
    appendCurrentItem(item) {
      currentItems = [...currentItems, item];
    },
    resetCurrentTrip() {
      currentTrip = null;
      currentBases = [];
      currentDays = [];
      currentItems = [];
    },
  };
}
