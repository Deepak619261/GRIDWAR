# args
what are args , these are just configuration data , we tell when app start as server in the program.cs 


args → config
↓
CreateBuilder → sets up Kestrel
↓
Kestrel → listens on port
↓
CORS → controls who can call
↓
Endpoints → handle requests


# nginx and IIS 
What are IIS and Nginx?
Both are web servers / reverse proxies that sit in front of your app (Kestrel).
What is a Reverse Proxy? (IMPORTANT)

Both IIS & Nginx are usually used as:
👉 Reverse Proxy
🧠 Meaning:

They sit in front of your backend and:

receive requests
forward them to your app
return response


Browser
   ↓
IIS / Nginx   ← handles internet traffic
   ↓
Kestrel       ← runs your .NET app
   ↓
Your API


Why not expose Kestrel directly?

Good question.

❌ Kestrel alone lacks:
advanced security
request filtering
load balancing
rate limiting


| Feature        | IIS        | Nginx         |
| -------------- | ---------- | ------------- |
| SSL handling   | ✅          | ✅             |
| Load balancing | ⚠️ limited | ✅ strong      |
| Static files   | ✅          | ✅ (very fast) |
| Security       | ✅          | ✅             |
| OS             | Windows    | Linux         |


SSL- secure sockets layer 
https=http+SSL
