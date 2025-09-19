/**
 * Expo config plugin to fix Podfile framework issues
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Updates the Podfile post_install section to ensure frameworks are found
 */
const withPodfileFixForFrameworkIssues = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      console.log('Adding Folly/New Arch and framework fixes to Podfile post_install...');
      
      const projectRoot = config.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');
      const podfilePath = path.join(iosDir, 'Podfile');
      
      if (!fs.existsSync(podfilePath)) {
        console.warn('Podfile not found. Skipping Podfile modifications.');
        return config;
      }
      
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');
      
      const uniqueMarker = '# FOLLY_COROUTINES_AND_NEW_ARCH_FIX_APPLIED_V3'; // Incremented marker

      if (!podfileContent.includes(uniqueMarker)) {
        const postInstallHookRegex = /post_install\s+do\s+\|installer\|/m;
        const postInstallMatch = podfileContent.match(postInstallHookRegex);
        
        if (postInstallMatch) {
          // Find the end of the post_install block
          // This regex looks for `end` at the beginning of a line, possibly indented
          // It assumes the post_install block is properly structured.
          let insertionPoint = -1;
          let level = 0;
          let searchStartIndex = postInstallMatch.index + postInstallMatch[0].length;
          
          // Simplified logic to find the end of the main post_install block
          // This is fragile; a more robust parser would be better for complex Podfiles.
          const lines = podfileContent.substring(searchStartIndex).split('\n');
          let currentCharacterIndex = searchStartIndex;
          let foundEnd = false;

          for (const line of lines) {
            if (line.trim().match(/^end$/)) { // Matches 'end' that isn't part of an if/else/do block inside
              // This is a best-guess heuristic. 
              // A more robust solution would involve a proper Ruby parser or more sophisticated block detection.
              // For now, we'll assume the main `post_install` ends before other major `end` blocks that might exist globally.
              // Let's try to find the last `end` that closes the `post_install do |installer|` block.
              // This often means finding the `end` that is at the same indentation level as `post_install` or less.
            }
            currentCharacterIndex += line.length + 1; // +1 for newline
          }
          
          // Fallback: search for the last 'end' before the Podfile truly ends or another target starts.
          // A common pattern is that `post_install` is one of the last major blocks.
          // We look for the `end` that correctly closes the `post_install do |installer|` block.
          // This typically is an `end` at a low indentation level.
          const lastEndRegex = /^(end)$/m; // Find `end` at the start of a line
          let match;
          let lastMatchIndex = -1;
          const podfileLines = podfileContent.split('\n');
          let postInstallIndentation = -1;
          for(let i=0; i < podfileLines.length; i++){
            if(podfileLines[i].includes('post_install do |installer|')){
                postInstallIndentation = podfileLines[i].match(/^\s*/)[0].length;
                break;
            }
          }

          if(postInstallIndentation !== -1){
            for(let i = podfileLines.length -1; i >= 0; i--){
                if(podfileLines[i].match(/^\s*end\s*$/) && podfileLines[i].match(/^\s*/)[0].length === postInstallIndentation){
                    // Found the matching end for post_install
                    // Calculate the actual index in the string
                    lastMatchIndex = podfileContent.lastIndexOf(podfileLines[i]);
                    break;
                }
            }
          }

          if (lastMatchIndex !== -1) {
            insertionPoint = lastMatchIndex;
            
            const fixBlock = `
  # ${uniqueMarker}
  # Custom GCC_PREPROCESSOR_DEFINITIONS for specific targets
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # Ensure GCC_PREPROCESSOR_DEFINITIONS is an array for robust manipulation
      defs = Array(config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'])
      defs.delete('$(inherited)') # Remove if present, we'll add it to the front
      defs = defs.flat_map { |d| d.is_a?(String) ? d.shellsplit : d } # Handle strings with spaces
      defs.compact! # Remove nils
      defs.uniq!

      if target.name == 'RCT-Folly'
        # Ensure FOLLY_HAS_COROUTINES is explicitly set to 0 for RCT-Folly
        # This prevents issues with missing Coroutine.h by disabling the feature
        defs.delete_if { |d| d.start_with?('FOLLY_HAS_COROUTINES=') }
        defs.push('FOLLY_HAS_COROUTINES=0')
        puts "[PodfileFix] RCT-Folly: Set FOLLY_HAS_COROUTINES=0"
      end

      if ['UDPDirectModule', 'UDPModule'].include?(target.name)
        # For our custom modules, also ensure Folly coroutines are off and New Arch is on
        defs.delete_if { |d| d.start_with?('FOLLY_HAS_COROUTINES=') }
        defs.push('FOLLY_HAS_COROUTINES=0')
        
        defs.delete_if { |d| d.start_with?('RCT_NEW_ARCH_ENABLED=') }
        defs.push('RCT_NEW_ARCH_ENABLED=1')

        # Also add FOLLY_CFG_NO_COROUTINES=1 to OTHER_CPLUSPLUSFLAGS for these targets
        # to match how RCT-Folly itself is compiled.
        current_cpp_flags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
        new_cpp_flags = [current_cpp_flags]
        unless new_cpp_flags.any? { |f| f.include?('FOLLY_CFG_NO_COROUTINES') }
          new_cpp_flags.push('-DFOLLY_CFG_NO_COROUTINES=1')
        end
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] = new_cpp_flags.join(' ')

        puts "[PodfileFix] #{target.name}: Set FOLLY_HAS_COROUTINES=0, RCT_NEW_ARCH_ENABLED=1 and FOLLY_CFG_NO_COROUTINES=1"
      end
      
      final_definitions = ['$(inherited)'] + defs
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = final_definitions.uniq.join(' ')
    end
  end

`;
            podfileContent = podfileContent.slice(0, insertionPoint) + fixBlock + podfileContent.slice(insertionPoint);
            fs.writeFileSync(podfilePath, podfileContent);
            console.log('✅ Successfully applied Folly/New Arch and framework search path fixes (V3) to Podfile post_install.');
          } else {
            console.warn('❌ Could not reliably find the end of the post_install block to insert Folly/New Arch fixes (V3).');
          }
        } else {
          console.warn('❌ Could not find post_install hook in Podfile. Skipping Folly/New Arch fixes (V3).');
        }
      } else {
        console.log('✅ Folly/New Arch and framework search path fixes (V3) already present in Podfile.');
      }
      
      return config;
    },
  ]);
};

module.exports = withPodfileFixForFrameworkIssues; 