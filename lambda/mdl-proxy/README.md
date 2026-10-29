# mdl-proxy

CORS proxy for the MyDramaList import feature. The static site can't fetch
`mydramalist.com` directly (no CORS headers there), so this fetches the list
page server-side and relays it with `Access-Control-Allow-Origin: *`.

Written in Python using only `urllib` (stdlib, no dependencies) on purpose:
Node's `fetch`/`https` clients get hit with Cloudflare's JS challenge on this
site (TLS/HTTP client fingerprinting), but curl and Python's `urllib` pass
through cleanly. A Node-based Lambda would not work here.

Deployed as a Lambda behind an API Gateway HTTP API (not a Lambda Function
URL — swap this note if your IAM policy grants `lambda:CreateFunctionUrlConfig`
and you'd rather use that instead).

## Deploy

```
./deploy.sh
```

Requires AWS credentials with permission to manage an IAM role and a Lambda
function named `tiergl-mdl-proxy`/`tiergl-mdl-proxy-role`, plus `apigateway:GET/POST/PATCH`
on `/apis` and `/apis/*`. Prints the API endpoint to paste into
`MDL_PROXY_ENDPOINT` in `assets/js/mydramalist-import.js`.

## Gotcha

`aws apigatewayv2 create-api --target <lambda-arn>` does *not* automatically
grant the Lambda invoke permission for the integration despite looking like
a one-shot "quick create." You need a separate `lambda:AddPermission` call
with `--principal apigateway.amazonaws.com`. The source-arn condition also
needs to be broad (`arn:aws:execute-api:<region>:<account>:<api-id>/*`) —
scoping it to `<api-id>/*/*/*` does not match how the `$default` catch-all
route invokes Lambda and silently fails invocation (API Gateway returns a
generic 500 with no Lambda invocation at all — no CloudWatch log group is
even created, which is the tell).
