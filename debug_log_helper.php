<?php
/**
 * Debug Log Helper (PHP Version)
 * This script handles log file operations: clearing and writing.
 * Deploy this script in your project root directory.
 * 
 * Usage:
 *     Clear log: GET http://{projectDomain}/debug_log_helper.php?action=clear&log={fullPath}
 *     Write file: POST http://{projectDomain}/debug_log_helper.php?action=write
 *                 Body: file={fullPath}&content={textContent}
 * 
 * Examples:
 *     Clear: http://api.ser.vi.localhost/debug_log_helper.php?action=clear&log=D:\dev\project1\v\1\error_log
 *     Write: POST to http://api.ser.vi.localhost/debug_log_helper.php?action=write
 *            with file=D:\dev\project1\v\1\combined_debug.txt&content=...
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$action = $_GET['action'] ?? 'clear'; // Default to 'clear' for backward compatibility

if ($action === 'write') {
    // Handle write action (POST request)
    $filePath = $_POST['file'] ?? '';
    $content = $_POST['content'] ?? '';
    
    if (empty($filePath)) {
        echo json_encode([
            'success' => false,
            'message' => "Missing 'file' parameter"
        ]);
        exit;
    }
    
    // Normalize path (handle Windows backslashes)
    $normalizedPath = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $filePath);
    
    // Create parent directory if it doesn't exist
    $parentDir = dirname($normalizedPath);
    if (!is_dir($parentDir)) {
        if (!mkdir($parentDir, 0755, true)) {
            echo json_encode([
                'success' => false,
                'message' => "Failed to create parent directory: $parentDir"
            ]);
            exit;
        }
    }
    
    // Write content to file (replacing existing content)
    if (file_put_contents($normalizedPath, $content) !== false) {
        echo json_encode([
            'success' => true,
            'message' => "File written successfully: $normalizedPath"
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => "Permission denied: unable to write file $normalizedPath"
        ]);
    }
    
} else {
    // Handle clear action (GET request, default)
    $logPath = $_GET['log'] ?? '';
    
    if (empty($logPath)) {
        echo json_encode([
            'success' => false,
            'message' => "Missing 'log' parameter"
        ]);
        exit;
    }
    
    // Normalize path (handle Windows backslashes)
    $normalizedPath = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $logPath);
    
    // Check if file exists
    if (!file_exists($normalizedPath)) {
        echo json_encode([
            'success' => false,
            'message' => "Log file not found: $normalizedPath"
        ]);
        exit;
    }
    
    // Check if it's a file (not a directory)
    if (!is_file($normalizedPath)) {
        echo json_encode([
            'success' => false,
            'message' => "Path is not a file: $normalizedPath"
        ]);
        exit;
    }
    
    // Clear file (truncate to empty)
    if (file_put_contents($normalizedPath, '') !== false) {
        echo json_encode([
            'success' => true,
            'message' => "Log file cleared successfully: $normalizedPath"
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => "Permission denied: unable to clear log file $normalizedPath"
        ]);
    }
}
?>
