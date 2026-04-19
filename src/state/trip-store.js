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
    updateCurrentTrip(nextTrip) {
      currentTrip = nextTrip;
      trips = trips.map((trip) => (trip.id === nextTrip.id ? { ...trip, ...nextTrip } : trip));
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
    updateCurrentItem(nextItem) {
      currentItems = currentItems.map((item) => (item.id === nextItem.id ? nextItem : item));
    },
    removeCurrentItem(itemId) {
      currentItems = currentItems.filter((item) => item.id !== itemId);
    },
    appendCurrentBase(base) {
      currentBases = [...currentBases, base];
    },
    updateCurrentBase(nextBase) {
      currentBases = currentBases.map((base) => (base.id === nextBase.id ? nextBase : base));
    },
    resetCurrentTrip() {
      currentTrip = null;
      currentBases = [];
      currentDays = [];
      currentItems = [];
    },
  };
}
