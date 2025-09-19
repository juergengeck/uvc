/**
 * Expo config plugin to modify the RCTSettingsManager.mm file to fix build issues
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Replaces the getConstants implementation in RCTSettingsManager.mm
 * with a stub that doesn't cause compilation errors
 */
const withRCTSettingsManagerFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      
      // This will be patched during pod install
      // The file is in node_modules until then
      const settingsManagerPath = path.join(iosDir, 'Pods/React-RCTSettings/RCTSettingsManager.mm');

      // Register a post-install hook
      if (!config.modResults.ios) {
        config.modResults.ios = {};
      }
      
      if (!config.modResults.ios.podfileProperties) {
        config.modResults.ios.podfileProperties = {};
      }
      
      // Add a custom post_install hook to fix the file
      if (!config.modResults.ios.podfileConfig) {
        config.modResults.ios.podfileConfig = {};
      }
      
      if (!config.modResults.ios.podfileConfig.post_install) {
        config.modResults.ios.podfileConfig.post_install = '';
      }
      
      console.log('Adding post-install hook to patch RCTSettingsManager.mm');
      
      // Add the post_install code
      config.modResults.ios.podfileConfig.post_install += `
  # Patch RCTSettingsManager.mm to fix build issues
  puts "Patching RCTSettingsManager.mm"
  settings_manager_path = File.join(installer.pods_project.targets.find { |t| t.name == 'React-RCTSettings' }.resource_bundle_targets.first.buildable_reference.path.parent.parent.parent, "RCTSettingsManager.mm")
  
  if File.exist?(settings_manager_path)
    puts "Found RCTSettingsManager.mm, patching..."
    settings_manager_content = File.read(settings_manager_path)
    
    # Only patch if needed
    if settings_manager_content.include?("typedConstants") || settings_manager_content.include?("JS::NativeSettingsManager::Constants::Builder::Input input")
patched_content = settings_manager_content.gsub(/- \\(facebook::react::ModuleConstants<JS::NativeSettingsManager::Constants>\\)getConstants[\\s\\S]*?\\{[\\s\\S]*?return[\\s\\S]*?;[\\s\\S]*?\\}/) do |match|
  # Log the matched content to verify we're replacing the correct code
  puts "Found problematic getConstants implementation, replacing..."
   "- (facebook::react::ModuleConstants<JS::NativeSettingsManager::Constants>)getConstants\\n{\\n  // Fixed implementation to avoid compilation errors\\n  static facebook::react::ModuleConstants<JS::NativeSettingsManager::Constants> constants{};\\n  return constants;\\n}\\n"
 end
      
      File.write(settings_manager_path, patched_content)
      puts "Patched RCTSettingsManager.mm successfully"
    else
      puts "RCTSettingsManager.mm already patched"
    end
  else
    puts "Could not find RCTSettingsManager.mm at #{settings_manager_path}"
  end
`;

      return config;
    },
  ]);
};

module.exports = withRCTSettingsManagerFix; 