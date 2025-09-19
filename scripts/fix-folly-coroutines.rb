#!/usr/bin/env ruby

# Comprehensive Folly Coroutines Fix
# This script ensures FOLLY_HAS_COROUTINES=0 is set for ALL targets that use Folly

def fix_folly_coroutines(installer)
  puts "[FollyFix] Applying comprehensive Folly coroutines fix..."
  
  # List of all targets that might use Folly headers
  targets_needing_folly_fix = [
    'RCT-Folly',
    'React-Core',
    'React-CoreModules', 
    'React-RCTNetwork',
    'React-RCTImage',
    'React-RCTText',
    'React-RCTAnimation',
    'React-cxxreact',
    'React-jsi',
    'React-jsiexecutor',
    'React-perflogger',
    'React-runtimeexecutor',
    'ReactCommon',
    'React-Codegen',
    'RNReanimated',
    'UDPDirectModule',
    'react-native-udp-direct',
    'llama-rn'
  ]
  
  installer.pods_project.targets.each do |target|
    # Apply fix to specific targets or any target that has Folly in dependencies
    should_fix = targets_needing_folly_fix.include?(target.name) || 
                  target.name.include?('UDP') ||
                  target.name.include?('React') ||
                  target.name.include?('RCT')
    
    if should_fix
      puts "[FollyFix] Fixing target: #{target.name}"
      target.build_configurations.each do |config|
        # Ensure GCC_PREPROCESSOR_DEFINITIONS exists
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        
        # Remove any existing FOLLY_HAS_COROUTINES definitions
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].delete_if { |d| d.include?('FOLLY_HAS_COROUTINES') }
        
        # Add FOLLY_HAS_COROUTINES=0
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FOLLY_HAS_COROUTINES=0'
        
        # Also add to OTHER_CPLUSPLUSFLAGS for C++ files
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] ||= '$(inherited)'
        unless config.build_settings['OTHER_CPLUSPLUSFLAGS'].include?('-DFOLLY_HAS_COROUTINES=0')
          config.build_settings['OTHER_CPLUSPLUSFLAGS'] += ' -DFOLLY_HAS_COROUTINES=0'
        end
        
        # Add to OTHER_CFLAGS for C files
        config.build_settings['OTHER_CFLAGS'] ||= '$(inherited)'
        unless config.build_settings['OTHER_CFLAGS'].include?('-DFOLLY_HAS_COROUTINES=0')
          config.build_settings['OTHER_CFLAGS'] += ' -DFOLLY_HAS_COROUTINES=0'
        end
      end
    end
  end
  
  # Also fix the main app target
  installer.target_installation_results.pod_target_installation_results.each do |pod_name, result|
    if pod_name == 'RCT-Folly'
      result.native_target.build_configurations.each do |config|
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].any? { |d| d.include?('FOLLY_HAS_COROUTINES') }
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FOLLY_HAS_COROUTINES=0'
        end
      end
    end
  end
  
  puts "[FollyFix] Folly coroutines fix applied to all relevant targets"
end

# Export the function for use in Podfile
if __FILE__ == $0
  puts "This script should be called from within a Podfile post_install hook"
  puts "Example usage:"
  puts "  post_install do |installer|"
  puts "    load 'scripts/fix-folly-coroutines.rb'"
  puts "    fix_folly_coroutines(installer)"
  puts "  end"
end