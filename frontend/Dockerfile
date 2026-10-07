FROM docker.io/library/nginx:1-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 15-resolver.envsh /docker-entrypoint.d/
COPY index.html style.css /usr/share/nginx/html/
COPY js /usr/share/nginx/html/js
COPY vendor /usr/share/nginx/html/vendor
# Only these vars are substituted, so nginx's own $variables survive.
ENV NGINX_ENVSUBST_FILTER="^(FETCHER_URL|NGINX_RESOLVER)$" \
    FETCHER_URL=http://fetcher:8080
EXPOSE 80
