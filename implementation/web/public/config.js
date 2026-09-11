// Fallback for `vite dev`, where nginx is not running. In the container this
// file is overwritten at startup by docker-entrypoint.sh from the environment.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {}
