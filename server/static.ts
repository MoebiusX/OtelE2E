/**
 * Production Static File Server
 * This module serves pre-built static files without requiring Vite
 * In K8s deployments with separate frontend, this may be skipped
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
    // import.meta.dirname may be undefined in some runtimes, fallback to cwd
    const baseDir = import.meta.dirname || process.cwd();
    const distPath = path.resolve(baseDir, "public");

    if (!fs.existsSync(distPath)) {
        // In K8s deployments with separate frontend pod, static files are served by nginx
        console.log('[STATIC] Public directory not found - skipping static file serving (frontend served separately)');
        return;
    }

    console.log(`[STATIC] Serving static files from ${distPath}`);
    app.use(express.static(distPath));

    // fall through to index.html if the file doesn't exist (SPA routing)
    app.use("*", (_req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
    });
}
