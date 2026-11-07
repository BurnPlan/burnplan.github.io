# OKBurnPlan

Prescribed burn planning workspace for Oklahoma.

Published at https://burnplan.github.io/ using GitHub Pages. This repository contains the public static website only.

Users can draw a simulation domain and ignition, select a period in Central Time, submit requests, and view simulation progress and results. Supabase provides authentication and request/result storage. Simulations run on the project computer; that worker must remain running to process requests.

The browser uses a public Supabase publishable key with user-scoped access policies. No worker credentials, passwords, model runtimes, or private simulation files belong in this repository.

To update the website, replace these public files with the contents of the local Website/app/dist folder, retaining .nojekyll. GitHub Pages should publish the main branch from its root directory.

Third-party notices are included with the vendor libraries.
