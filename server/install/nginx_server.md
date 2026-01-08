# Using nginx to serve the application

To use nginx to serve the application add this server location definition
to `/etc/nginx/sites-enabled/teamdb` (or other site if already existing).

For example if the service is running in a Proxmox lxc container, you need to serve it through a service like nginx.

```
server {
    listen 80;
    server_name _;
 
    location /teamdb/ {
        proxy_pass http://127.0.0.1:8765/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
