let timerId: NodeJS.Timeout;
let FPS = 30; // Default interval set to 1000ms (1 second)
let interval = 1000 / FPS;

self.onmessage = function(e) {
  if (e.data.command === "start") {
    timerId = setInterval(() => {
      postMessage("tick");
    }, interval);
  } else if (e.data.command === "stop") {
    clearInterval(timerId);
    postMessage("stopped");
  }
};
