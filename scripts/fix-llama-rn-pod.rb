
#!/usr/bin/env ruby

# This script fixes llama-rn duplicate header issues at build time
# Run this script if you're still experiencing build problems

def fix_llama_rn_header_duplicates
  puts "Fixing llama.rn duplicate header issues..."
  
  # Find the Xcode project dir
  project_dir = Dir.pwd
  pods_dir = File.join(project_dir, 'ios/Pods')
  
  unless Dir.exist?(pods_dir)
    puts "Error: Pods directory not found at #{pods_dir}"
    return
  end
  
  # Find the Xcode project
  xcodeproj_path = Dir.glob(File.join(pods_dir, '*.xcodeproj')).first
  
  unless xcodeproj_path
    puts "Error: No Xcode project found in Pods directory"
    return
  end
  
  # Find the 'llama-rn' target in the Pods project
  begin
    require 'xcodeproj'
    
    project = Xcodeproj::Project.open(xcodeproj_path)
    llama_target = project.targets.find { |t| t.name == 'llama-rn' }
    
    if llama_target
      puts "Found 'llama-rn' target in Pods project"
      
      # Fix the copy files build phases to avoid duplicate paths
      llama_target.build_phases.each do |phase|
        next unless phase.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase) ||
                    phase.is_a?(Xcodeproj::Project::Object::PBXHeadersBuildPhase)
        
        # Group file paths by filename to eliminate duplicates
        existing_files = {}
        
        phase.files.each do |file|
          next unless file.file_ref
          
          filename = file.file_ref.display_name
          existing_files[filename] ||= file
        end
        
        # Keep only one file for each filename
        if phase.files.count > existing_files.count
          puts "  Removing duplicate files in '#{phase.display_name}' build phase"
          phase.files.clear
          existing_files.values.each { |file| phase.add_file_reference(file.file_ref) }
        end
      end
      
      # Save changes
      project.save
      puts "Saved changes to Pods project"
    else
      puts "Warning: Could not find 'llama-rn' target in Pods project"
    end
  rescue LoadError
    puts "Error: 'xcodeproj' gem not found. Try installing with: gem install xcodeproj"
    return
  rescue => e
    puts "Error fixing Xcode project: #{e.message}"
    return
  end
  
  puts "Completed llama.rn header duplicate fixes"
end

# Execute the fix
fix_llama_rn_header_duplicates
