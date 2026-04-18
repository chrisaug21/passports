export const tripStore = createTripStore();

function createTripStore() {
  let trips = [];

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
  };
}
