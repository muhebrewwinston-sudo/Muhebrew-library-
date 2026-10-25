# Muhebrew Library – Frontend Client

Vanilla HTML5, modern CSS3, and JavaScript web client for the Muhebrew Library platform.

## Structure
- `index.html`: Main public student library browsing, 3-layer upload flow, download progression modal, and category drawers.
- `admin.html`: Owner / Administrator dashboard for statistics, user management, reports, single upload, Drime cloud sync, and bulk upload.
- `auth.html`: Student & teacher sign-in, account creation, and password management.
- `teacher.html`: Teacher resource repository interface.
- `css/`: Modular stylesheets (`style.css` with deep prestigious academic forest green palette `#14532d`).
- `js/`: Client scripts for API requests (`api.js`), library search & interaction (`app.js`), admin functions (`admin.js`), and icon rendering (`icons.js`, `lucide.min.js`).

## Running with Backend
The frontend is statically served by the backend server (`backend/server.js`) on port 3000.
