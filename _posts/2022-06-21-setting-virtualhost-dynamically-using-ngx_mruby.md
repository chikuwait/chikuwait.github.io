---
title: Setting Virtualhost Configuration Dynamically Using ngx_mruby
date : 21-06-2022
---

## 1.Introduction
"Virtualhost" of nginx can host and manage multiple websites of various domains on a single server.
To use its feature, it only adds a server block in the nginx configuration file as below.
The "server_name" in the example configuration file sets a domain name for managed websites.
Also, the "root" sets the directory that stores its website's contents.

```nginx
...
http {
    server {
        listen 80;
        server_name example1.com;
        root /var/www/html/example1;
        # Other configs
    }
    server {
        listen 80;
        server_name example2.com;
        root /var/www/html/example2;
        # Other configs
    }
    # Many server blocks...
    
}
...

```

However, if we manage a service that hosts many websites, we necessary to add virtualhost configurations for each website to nginx configuration file.
In addition, it takes time and effort to manage these configuration files individually.
In this article, I introduce how to set configurations of virtualhost dynamically by defined behavior by programs utilizing [ngx_mruby](https://github.com/matsumotory/ngx_mruby) which uses script language mruby to programmatically handle nginx.

## 2.Overview of ngx_mruby
ngx_mruby enables dynamic control using mruby script language.
It attaches mruby scripts to nginx configuration files or various nginx events.
In addtion, mruby libraries (mrbgems) exist MySQL, Redis, HTTP-client, Linux features wrappers, and so on.
It achieves complex dynamic control for nginx such as cooperation with other systems by combining ngx_mruby and these mrbgems.

ngx_mruby is utilized such as [dynamic TLS certificates management](https://ieeexplore.ieee.org/document/8377862) and [dynamic contents caching](https://tech.pepabo.com/2016/12/02/ngx-mruby-dynamic-cache/).
These use cases get contents from DB or KVS depending on the contents of requests by combining ngx_mruby and mrbgems.

## 3.Setting Virtualhost Configuration Dynamically
I implemented a dynamic configuration of the root directive for virtualhost as PoC.
The details of PoC are as follows.

- nginx.conf

```nginx
http {
...
    mruby_init_code ' # Init hostname to path cache
       userdata = Userdata.new
       userdata.cache = {} 
    ';

    server {
        listen 80;
        location / {
            mruby_set $docroot /usr/local/nginx/hook/virtualhost.rb;
            root   $docroot;
            index  index.html index.htm;
        }

        error_page   500 502 503 504  /50x.html;
        location = /50x.html {
            root   html;
        }
    }
}
```


- virtualhost.rb

```ruby
userdata = Userdata.new
cache = userdata.cache

r = Nginx::Request.new
hostname = r.hostname

path = ""
if cache.has_key?(hostname) #Cache lookup
    path = cache[hostname]
else
    path = SimpleHttp.new("http", "127.0.0.1", 8080).request("GET", "v1/hostname?hostname=#{hostname}", {}).body #query external API server
    cache[hostname] = path
end

if File.directory?(path)
    return path
else
    return ""
end
```
I defined only a single server block in its nginx.conf.
All requests against servers refer its a block.
When nginx receives requests from clients, it is run virtulhost.rb which is amruby script and stores execution results in the $docroot variable.
Then, the content of the $docroot variable is used for the path of the document root.

virtualhost.rb obtains a hostname from HTTP requests at first.
Then, it gets the document root path corresponding to the hostname using an external API server.

However, it is inefficient to query the API server for each request to the server.
For this reason, I implemented to cache the hostname and document root path in a hash table.
I use mruby-userdata to implement the cache.
It allows to sharing of data among programs that share the mruby state.
Therefore, it can reuse the result of the first API request to server requests for the second time by implementing using mruby-userdata.
Since its implementation is a PoC, the cache retention period is not considered, but it may be necessary to implement it for more effective handling.

## 4.Conclusion
I introduced how to dynamically set nginx's virtualhost configuration using ngx_mruby.
It allows more flexible control of nginx, such as cooperating with external API servers, by running various mruby scripts on nginx events and configurations.
I only dynamically configured the document root path in this article, but we can do the same with ssl_certificate, ssl_certificate_key, and so on.