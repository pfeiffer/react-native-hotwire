// Reads how often each page was fetched, into output.counts for the flow's assertions.
const state = json(http.get(SERVER + '/__state').body);
output.counts = state.counts;
console.log('counts ' + JSON.stringify(state.counts));
