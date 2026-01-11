#!/usr/bin/env python3
# For Windows/XAMPP: Replace the above line with your Python path, e.g.:
# #!C:/Python312/python.exe
# Or use: #!python3 (if Python is in PATH)
# Use forward slashes / not backslashes \ in the path
"""
Debug Log File Clearer
This script clears (truncates) log files when called via HTTP GET request.
Deploy this script in your project root directory.

Usage:
    http://{projectDomain}/debug_clear_log.py?log={fullPath}

Example:
    http://project1.localhost/debug_clear_log.py?log=d:\dev\project1\v\1\error_log

Setup Instructions:
    See docs/xampp_python_cgi_setup.md for detailed XAMPP/Windows setup guide.
"""

import os
import sys
from urllib.parse import parse_qs
import json

def clear_log_file(log_path):
    """Clear (truncate) the log file at the given path."""
    try:
        # Normalize path (handle Windows backslashes)
        normalized_path = os.path.normpath(log_path)
        
        # Check if file exists
        if not os.path.exists(normalized_path):
            return {
                "success": False,
                "message": f"Log file not found: {normalized_path}"
            }
        
        # Truncate file (clear contents)
        with open(normalized_path, 'w') as f:
            f.write('')
        
        return {
            "success": True,
            "message": f"Log file cleared successfully: {normalized_path}"
        }
    except PermissionError:
        return {
            "success": False,
            "message": f"Permission denied: unable to clear log file {normalized_path}"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Error clearing log file: {str(e)}"
        }

# Handle CGI or WSGI request
if __name__ == '__main__':
    # Get query parameters
    query_string = os.environ.get('QUERY_STRING', '')
    params = parse_qs(query_string)
    
    log_path = params.get('log', [None])[0]
    
    if not log_path:
        response = {
            "success": False,
            "message": "Missing 'log' parameter"
        }
    else:
        response = clear_log_file(log_path)
    
    # Return JSON response with CORS headers
    print("Content-Type: application/json")
    print("Access-Control-Allow-Origin: *")
    print()
    print(json.dumps(response))
