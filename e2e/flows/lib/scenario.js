// Sets scenario flags on the fixture server; SCENARIO is a JSON object of flags.
http.post(SERVER + '/__scenario', { body: SCENARIO, headers: { 'Content-Type': 'application/json' } });
