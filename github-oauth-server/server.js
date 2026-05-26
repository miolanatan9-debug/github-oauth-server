const https = require("https");
const http = require("http");

const CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const PORT          = process.env.PORT || 3000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function responder(res, status, obj) {
  res.writeHead(status, CORS_HEADERS);
  res.end(JSON.stringify(obj));
}

const server = http.createServer(function(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    responder(res, 200, { status: "ok", service: "GitHub OAuth Server" });
    return;
  }

  if (req.method === "POST" && req.url === "/exchange") {
    var body = "";
    req.on("data", function(chunk) { body += chunk; });
    req.on("end", function() {
      var parsed;
      try { parsed = JSON.parse(body); } catch (e) {
        responder(res, 400, { error: "Body JSON invalido." });
        return;
      }

      var code = parsed.code;
      if (!code) {
        responder(res, 400, { error: "Parametro code ausente." });
        return;
      }

      if (!CLIENT_ID || !CLIENT_SECRET) {
        responder(res, 500, { error: "Variaveis de ambiente nao configuradas." });
        return;
      }

      var payload = JSON.stringify({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code:          code
      });

      var options = {
        hostname: "github.com",
        path:     "/login/oauth/access_token",
        method:   "POST",
        headers: {
          "Content-Type":  "application/json",
          "Accept":        "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      };

      var ghReq = https.request(options, function(ghRes) {
        var data = "";
        ghRes.on("data", function(chunk) { data += chunk; });
        ghRes.on("end", function() {
          var result;
          try { result = JSON.parse(data); } catch (e) {
            responder(res, 500, { error: "Resposta invalida do GitHub." });
            return;
          }
          if (result.error) {
            responder(res, 400, { error: result.error_description || result.error });
            return;
          }
          if (!result.access_token) {
            responder(res, 400, { error: "Token nao retornado. Code pode ter expirado." });
            return;
          }
          responder(res, 200, {
            access_token: result.access_token,
            token_type:   result.token_type,
            scope:        result.scope
          });
        });
      });

      ghReq.on("error", function(e) {
        responder(res, 500, { error: "Erro ao contatar GitHub: " + e.message });
      });

      ghReq.write(payload);
      ghReq.end();
    });
    return;
  }

  responder(res, 404, { error: "Rota nao encontrada." });
});

server.listen(PORT, function() {
  console.log("Servidor OAuth rodando na porta " + PORT);
});
