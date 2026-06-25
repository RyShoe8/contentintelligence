export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { isMongoNetworkError, resetMongoClient } = await import("@content-resourcer/db");
    process.on("unhandledRejection", (reason) => {
      if (isMongoNetworkError(reason)) {
        console.error("[mongo] unhandled network rejection — resetting client");
        void resetMongoClient();
      }
    });
  }
}
