import os
import requests
from functools import wraps
from flask import request, jsonify
from jose import jwt, jwk

# It's best practice to get these from environment variables
# Ensure you set these in your environment before running the app
COGNITO_REGION = os.environ.get('COGNITO_REGION', 'us-east-1')
COGNITO_USERPOOL_ID = os.environ.get('COGNITO_USERPOOL_ID', 'us-east-1_Qz0XQbRYF')
COGNITO_APP_CLIENT_ID = os.environ.get('COGNITO_APP_CLIENT_ID', '6trsdho1dueumlof1pqb8hqe67')

# Construct the URL to fetch the public keys (JWKS)
keys_url = f'https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USERPOOL_ID}/.well-known/jwks.json'

# Fetch the keys and cache them. 
# In a production app, you might implement a more robust caching mechanism.
try:
    response = requests.get(keys_url)
    response.raise_for_status()
    keys = response.json()['keys']
except requests.exceptions.RequestException as e:
    print(f"FATAL: Failed to fetch JWKS from Cognito: {e}")
    keys = []

def token_required(f):
    """A decorator to validate the Cognito JWT token present in the Authorization header."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'message': 'Authorization token is missing!'}), 401

        if not keys:
            return jsonify({'message': 'JWKS not loaded, cannot validate token. Check Cognito configuration.'}), 500

        try:
            # Get the unverified header from the token to find the correct public key
            unverified_header = jwt.get_unverified_header(token)
            
            # Find the appropriate public key from the JWKS
            rsa_key = {}
            for key in keys:
                if key['kid'] == unverified_header['kid']:
                    rsa_key = {
                        'kty': key['kty'],
                        'kid': key['kid'],
                        'use': key['use'],
                        'n': key['n'],
                        'e': key['e']
                    }
                    break
            
            if not rsa_key:
                return jsonify({'message': 'Public key not found in JWKS'}), 500

            # Verify the token's signature and claims
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=['RS256'],
                audience=COGNITO_APP_CLIENT_ID,  # The 'aud' claim
                issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USERPOOL_ID}" # The 'iss' claim
            )
            
            # Pass the user's unique identifier ('sub' claim) to the decorated function
            kwargs['current_user_sub'] = payload['sub']

        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.JWTClaimsError as e:
            return jsonify({'message': 'Invalid claims, please check the audience and issuer', 'error': str(e)}), 401
        except Exception as e:
            return jsonify({'message': 'Error decoding token', 'error': str(e)}), 500

        return f(*args, **kwargs)

    return decorated_function
