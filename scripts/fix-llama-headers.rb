#!/usr/bin/env ruby

# This script fixes the "React/RCTEventEmitter.h file not found" error in llama.rn

begin
  require 'xcodeproj'
rescue LoadError
  system('gem install xcodeproj')
  require 'xcodeproj'
end

def fix_llama_headers
  puts "Fixing llama.rn React header search paths..."
  
  # Find the Xcode project
  project_dir = ARGV[0] || File.expand_path('../../ios', __FILE__)
  pods_dir = File.join(project_dir, 'Pods')
  
  unless Dir.exist?(pods_dir)
    puts "Error: Pods directory not found at #{pods_dir}"
    return false
  end
  
  # Find the Pods Xcode project
  xcodeproj_path = Dir.glob(File.join(pods_dir, '*.xcodeproj')).first
  
  unless xcodeproj_path
    puts "Error: No Xcode project found in Pods directory"
    return false
  end
  
  begin
    # Open the project
    project = Xcodeproj::Project.open(xcodeproj_path)
    
    # Find the llama-rn target
    llama_target = project.targets.find { |t| t.name == 'llama-rn' }
    
    unless llama_target
      puts "Error: Could not find 'llama-rn' target in the Pods project"
      return false
    end
    
    puts "Found llama-rn target in Pods project"
    
    # Get the build configurations
    llama_target.build_configurations.each do |config|
      # Get the build settings
      build_settings = config.build_settings
      
      # Add the React header search paths
      header_search_paths = build_settings['HEADER_SEARCH_PATHS'] || '$(inherited)'
      
      # Add React headers if not already included
      react_paths = [
        '"$(PODS_ROOT)/Headers/Public/React-Core"',
        '"$(PODS_ROOT)/Headers/Public/React"',
        '"$(PODS_ROOT)/Headers/Public/React-RCTEventEmitter"',
        '"$(PODS_ROOT)/Headers/Public/React-cxxreact"',
        '"$(PODS_ROOT)/Headers/Public/React-jsi"'
      ]
      
      updated = false
      
      # Convert to array if it's a string
      if header_search_paths.is_a?(String)
        header_search_paths = header_search_paths.split(' ')
      end
      
      # Add each React path if not already included
      react_paths.each do |path|
        unless header_search_paths.include?(path)
          header_search_paths << path
          updated = true
        end
      end
      
      if updated
        build_settings['HEADER_SEARCH_PATHS'] = header_search_paths
        puts "Updated header search paths for #{config.name} configuration"
      else
        puts "Header search paths already set for #{config.name} configuration"
      end
      
      # Also ensure framework search paths include React
      framework_search_paths = build_settings['FRAMEWORK_SEARCH_PATHS'] || '$(inherited)'
      
      # Convert to array if it's a string
      if framework_search_paths.is_a?(String)
        framework_search_paths = framework_search_paths.split(' ')
      end
      
      # Add React framework search paths
      react_framework_paths = [
        '"$(PODS_CONFIGURATION_BUILD_DIR)/React-Core"',
        '"$(PODS_CONFIGURATION_BUILD_DIR)/React"'
      ]
      
      framework_updated = false
      
      react_framework_paths.each do |path|
        unless framework_search_paths.include?(path)
          framework_search_paths << path
          framework_updated = true
        end
      end
      
      if framework_updated
        build_settings['FRAMEWORK_SEARCH_PATHS'] = framework_search_paths
        puts "Updated framework search paths for #{config.name} configuration"
      end
    end
    
    # Save changes
    project.save
    puts "Successfully updated llama-rn build settings"
    return true
  rescue => e
    puts "Error: #{e.message}"
    puts e.backtrace
    return false
  end
end

# Execute the fix
success = fix_llama_headers
exit(success ? 0 : 1) 