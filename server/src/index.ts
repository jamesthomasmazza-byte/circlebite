import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();

// Explicit localhost binding, not all interfaces: nginx (or, in dev, Vite) is the only thing
// that should ever reach this process. The security group already blocks external access to
// this port in production, but the app shouldn't depend on that alone.
app.listen(env.port, "127.0.0.1", () => {
  console.log(`circlebite server listening on 127.0.0.1:${env.port} (${env.nodeEnv})`);
});
