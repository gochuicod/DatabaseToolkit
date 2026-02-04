import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In production, static files are in the same directory as the compiled server
  const distPath = path.resolve(__dirname, "public");
  
  // Also check for dist/public as an alternative path
  const altDistPath = path.resolve(process.cwd(), "dist", "public");
  
  let staticPath = distPath;
  
  if (!fs.existsSync(distPath)) {
    if (fs.existsSync(altDistPath)) {
      staticPath = altDistPath;
      console.log(`Using alternative static path: ${altDistPath}`);
    } else {
      console.error(`Could not find build directory at ${distPath} or ${altDistPath}`);
      // Don't throw - serve a basic response instead
      app.use("*", (_req, res) => {
        res.status(503).send("Application is starting up. Please refresh in a moment.");
      });
      return;
    }
  }

  console.log(`Serving static files from: ${staticPath}`);
  app.use(express.static(staticPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(staticPath, "index.html"));
  });
}
