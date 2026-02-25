FROM nginx:stable-alpine

# Ensure openssl is available for certificate generation
RUN apk add --no-cache openssl

# Copy helper scripts into image (they can be overridden by mounts in compose)
COPY init-cert.sh /usr/local/bin/init-cert.sh
COPY proxy-healthcheck.sh /usr/local/bin/proxy-healthcheck.sh
RUN chmod +x /usr/local/bin/init-cert.sh /usr/local/bin/proxy-healthcheck.sh

CMD ["/bin/sh", "-c", "/usr/local/bin/init-cert.sh && exec nginx -g 'daemon off;'"]
