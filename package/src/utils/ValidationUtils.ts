/**
 * Validation Utilities
 * 
 * Validation functions for BLE data and configurations
 */

import { ESP32WiFiCredentials } from '../types/esp32';

export class ValidationUtils {
  /**
   * Validate WiFi SSID
   */
  static validateSSID(ssid: string): { valid: boolean; error?: string } {
    if (!ssid) {
      return { valid: false, error: 'SSID is required' };
    }

    if (ssid.length > 32) {
      return { valid: false, error: 'SSID must be 32 characters or less' };
    }

    if (ssid.length === 0) {
      return { valid: false, error: 'SSID cannot be empty' };
    }

    return { valid: true };
  }

  /**
   * Validate WiFi password
   */
  static validateWiFiPassword(password: string): { valid: boolean; error?: string } {
    if (!password) {
      return { valid: false, error: 'Password is required' };
    }

    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters' };
    }

    if (password.length > 63) {
      return { valid: false, error: 'Password must be 63 characters or less' };
    }

    return { valid: true };
  }

  /**
   * Validate IP address
   */
  static validateIPAddress(ip: string): { valid: boolean; error?: string } {
    if (!ip) {
      return { valid: false, error: 'IP address is required' };
    }

    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    if (!ipRegex.test(ip)) {
      return { valid: false, error: 'Invalid IP address format' };
    }

    return { valid: true };
  }

  /**
   * Validate ESP32 WiFi credentials
   */
  static validateESP32WiFiCredentials(credentials: ESP32WiFiCredentials): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate SSID
    const ssidResult = this.validateSSID(credentials.ssid);
    if (!ssidResult.valid && ssidResult.error) {
      errors.push(ssidResult.error);
    }

    // Validate password
    const passwordResult = this.validateWiFiPassword(credentials.password);
    if (!passwordResult.valid && passwordResult.error) {
      errors.push(passwordResult.error);
    }

    // Validate optional static IP configuration
    if (credentials.staticIP) {
      const staticIPResult = this.validateIPAddress(credentials.staticIP);
      if (!staticIPResult.valid && staticIPResult.error) {
        errors.push(`Static IP: ${staticIPResult.error}`);
      }
    }

    if (credentials.gateway) {
      const gatewayResult = this.validateIPAddress(credentials.gateway);
      if (!gatewayResult.valid && gatewayResult.error) {
        errors.push(`Gateway: ${gatewayResult.error}`);
      }
    }

    if (credentials.subnet) {
      const subnetResult = this.validateIPAddress(credentials.subnet);
      if (!subnetResult.valid && subnetResult.error) {
        errors.push(`Subnet: ${subnetResult.error}`);
      }
    }

    if (credentials.dns1) {
      const dns1Result = this.validateIPAddress(credentials.dns1);
      if (!dns1Result.valid && dns1Result.error) {
        errors.push(`DNS1: ${dns1Result.error}`);
      }
    }

    if (credentials.dns2) {
      const dns2Result = this.validateIPAddress(credentials.dns2);
      if (!dns2Result.valid && dns2Result.error) {
        errors.push(`DNS2: ${dns2Result.error}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate MAC address
   */
  static validateMACAddress(mac: string): { valid: boolean; error?: string } {
    if (!mac) {
      return { valid: false, error: 'MAC address is required' };
    }

    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    
    if (!macRegex.test(mac)) {
      return { valid: false, error: 'Invalid MAC address format' };
    }

    return { valid: true };
  }

  /**
   * Validate UUID format
   */
  static validateUUID(uuid: string): { valid: boolean; error?: string } {
    if (!uuid) {
      return { valid: false, error: 'UUID is required' };
    }

    // Check for 16-bit UUID (4 hex characters)
    const uuid16Regex = /^[0-9A-Fa-f]{4}$/;
    if (uuid16Regex.test(uuid)) {
      return { valid: true };
    }

    // Check for 128-bit UUID (with or without dashes)
    const uuid128Regex = /^[0-9A-Fa-f]{8}-?[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{12}$/;
    if (uuid128Regex.test(uuid)) {
      return { valid: true };
    }

    return { valid: false, error: 'Invalid UUID format' };
  }

  /**
   * Validate BLE device name
   */
  static validateDeviceName(name: string): { valid: boolean; error?: string } {
    if (!name) {
      return { valid: false, error: 'Device name is required' };
    }

    if (name.length > 248) {
      return { valid: false, error: 'Device name must be 248 characters or less' };
    }

    // Check for invalid characters (control characters)
    const hasInvalidChars = /[\x00-\x1F\x7F]/.test(name);
    if (hasInvalidChars) {
      return { valid: false, error: 'Device name contains invalid characters' };
    }

    return { valid: true };
  }

  /**
   * Validate heart rate value
   */
  static validateHeartRate(bpm: number): { valid: boolean; error?: string } {
    if (typeof bpm !== 'number' || isNaN(bpm)) {
      return { valid: false, error: 'Heart rate must be a number' };
    }

    if (bpm < 30 || bpm > 220) {
      return { valid: false, error: 'Heart rate must be between 30 and 220 BPM' };
    }

    return { valid: true };
  }

  /**
   * Validate SpO2 value
   */
  static validateSpO2(percentage: number): { valid: boolean; error?: string } {
    if (typeof percentage !== 'number' || isNaN(percentage)) {
      return { valid: false, error: 'SpO2 must be a number' };
    }

    if (percentage < 70 || percentage > 100) {
      return { valid: false, error: 'SpO2 must be between 70% and 100%' };
    }

    return { valid: true };
  }

  /**
   * Validate step count
   */
  static validateStepCount(steps: number): { valid: boolean; error?: string } {
    if (typeof steps !== 'number' || isNaN(steps)) {
      return { valid: false, error: 'Step count must be a number' };
    }

    if (steps < 0) {
      return { valid: false, error: 'Step count cannot be negative' };
    }

    if (steps > 100000) {
      return { valid: false, error: 'Step count seems unreasonably high (>100,000)' };
    }

    return { valid: true };
  }

  /**
   * Validate battery percentage
   */
  static validateBatteryPercentage(percentage: number): { valid: boolean; error?: string } {
    if (typeof percentage !== 'number' || isNaN(percentage)) {
      return { valid: false, error: 'Battery percentage must be a number' };
    }

    if (percentage < 0 || percentage > 100) {
      return { valid: false, error: 'Battery percentage must be between 0 and 100' };
    }

    return { valid: true };
  }

  /**
   * Validate confidence score
   */
  static validateConfidence(confidence: number): { valid: boolean; error?: string } {
    if (typeof confidence !== 'number' || isNaN(confidence)) {
      return { valid: false, error: 'Confidence must be a number' };
    }

    if (confidence < 0 || confidence > 100) {
      return { valid: false, error: 'Confidence must be between 0 and 100' };
    }

    return { valid: true };
  }
}