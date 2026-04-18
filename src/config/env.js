let envPromise;

export function initializeEnv() {
  if (!envPromise) {
    envPromise = fetch("/api/public-config", {
      headers: {
        accept: "application/json",
      },
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Config request failed with status ${response.status}`);
      }

      return response.json();
    });
  }

  return envPromise;
}
