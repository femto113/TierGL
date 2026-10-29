#!/usr/bin/env bash
# Deploys the MyDramaList CORS proxy as a Lambda behind an API Gateway HTTP
# API (not a Lambda Function URL -- this AWS account's IAM policy grants
# apigateway:* on /apis but not lambda:CreateFunctionUrlConfig).
set -euo pipefail

FUNCTION_NAME="tiergl-mdl-proxy"
ROLE_NAME="tiergl-mdl-proxy-role"
API_NAME="tiergl-mdl-proxy-api"
REGION="${AWS_REGION:-us-east-1}"
RUNTIME="python3.12"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
FUNCTION_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"

cd "$(dirname "$0")"

echo "Region: ${REGION}"

ROLE_ARN="$(aws iam get-role --region "${REGION}" --role-name "${ROLE_NAME}" --query 'Role.Arn' --output text 2>/dev/null || true)"

if [ -z "${ROLE_ARN}" ]; then
    echo "Creating IAM role ${ROLE_NAME}..."
    ROLE_ARN="$(aws iam create-role \
        --region "${REGION}" \
        --role-name "${ROLE_NAME}" \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": { "Service": "lambda.amazonaws.com" },
                "Action": "sts:AssumeRole"
            }]
        }' \
        --query 'Role.Arn' --output text)"

    aws iam attach-role-policy \
        --region "${REGION}" \
        --role-name "${ROLE_NAME}" \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

    echo "Waiting for IAM role to propagate..."
    sleep 10
else
    echo "Reusing existing IAM role ${ROLE_ARN}"
fi

rm -f function.zip
python3 -c "import zipfile; zipfile.ZipFile('function.zip', 'w').write('lambda_function.py')"
echo "Zipped lambda_function.py -> function.zip"

if aws lambda get-function --region "${REGION}" --function-name "${FUNCTION_NAME}" >/dev/null 2>&1; then
    echo "Updating existing function code..."
    aws lambda update-function-code \
        --region "${REGION}" \
        --function-name "${FUNCTION_NAME}" \
        --zip-file fileb://function.zip >/dev/null
else
    echo "Creating function ${FUNCTION_NAME}..."
    aws lambda create-function \
        --region "${REGION}" \
        --function-name "${FUNCTION_NAME}" \
        --runtime "${RUNTIME}" \
        --handler lambda_function.lambda_handler \
        --role "${ROLE_ARN}" \
        --timeout 15 \
        --memory-size 256 \
        --zip-file fileb://function.zip >/dev/null
    echo "Waiting for function to become active..."
    aws lambda wait function-active --region "${REGION}" --function-name "${FUNCTION_NAME}"
fi

API_ID="$(aws apigatewayv2 get-apis --region "${REGION}" --query "Items[?Name=='${API_NAME}'].ApiId" --output text)"

if [ -n "${API_ID}" ] && [ "${API_ID}" != "None" ]; then
    echo "Reusing existing HTTP API ${API_ID}"
else
    echo "Creating HTTP API ${API_NAME} with Lambda proxy integration..."
    API_ID="$(aws apigatewayv2 create-api \
        --region "${REGION}" \
        --name "${API_NAME}" \
        --protocol-type HTTP \
        --target "${FUNCTION_ARN}" \
        --cors-configuration AllowOrigins=*,AllowMethods=GET,AllowHeaders=* \
        --query ApiId --output text)"
fi

aws lambda add-permission \
    --region "${REGION}" \
    --function-name "${FUNCTION_NAME}" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/*" \
    --statement-id ApiGatewayInvokePermission >/dev/null 2>&1 || true

API_ENDPOINT="$(aws apigatewayv2 get-api --region "${REGION}" --api-id "${API_ID}" --query ApiEndpoint --output text)"

echo ""
echo "Deployed. API endpoint:"
echo "${API_ENDPOINT}"
echo ""
echo "Paste this into MDL_PROXY_ENDPOINT in assets/js/mydramalist-import.js"
