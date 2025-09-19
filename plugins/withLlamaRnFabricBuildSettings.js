const { withXcodeProject } = require('@expo/config-plugins');

const LlamaRnTargetName = 'llama-rn';
// Paths needed by llama-rn, identified from the previous post_install hook fix
const requiredHeaderSearchPaths = [
  '"$(PODS_ROOT)/Headers/Public/React-Core"',
  '"$(PODS_ROOT)/Headers/Public/React"', // Likely redundant if React-Core is included, but keep for now based on old fix
  '"$(PODS_ROOT)/Headers/Public/React-RCTEventEmitter"',
  '"$(PODS_ROOT)/Headers/Public/React-cxxreact"',
  '"$(PODS_ROOT)/Headers/Public/React-jsi"'
];

const withLlamaRnFabricBuildSettings = (config) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const target = xcodeProject.pbxTargetByName(LlamaRnTargetName);

    if (!target) {
      console.warn(`[withLlamaRnFabricBuildSettings] Warning: Target ${LlamaRnTargetName} not found. Skipping modifications.`);
      return config;
    }

    console.log(`[withLlamaRnFabricBuildSettings] Modifying build settings for target: ${LlamaRnTargetName}`);

    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const buildConfig = configurations[key];
      // Ensure we are modifying a configuration associated with the llama-rn target
      if (buildConfig.isa === 'XCBuildConfiguration' && target.buildConfigurationList === buildConfig.buildConfigurationList) {

        let currentPaths = buildConfig.buildSettings.HEADER_SEARCH_PATHS || ['"$(inherited)"'];
        if (typeof currentPaths === 'string') {
          // Handle cases where paths might be a single string initially
           currentPaths = [currentPaths];
        } else if (!Array.isArray(currentPaths)) {
            console.warn(`[withLlamaRnFabricBuildSettings] Unexpected type for HEADER_SEARCH_PATHS in ${buildConfig.name}. Skipping.`);
            continue;
        }


        let updated = false;
        requiredHeaderSearchPaths.forEach(path => {
          if (!currentPaths.includes(path)) {
            currentPaths.push(path);
            updated = true;
          }
        });

        if (updated) {
          buildConfig.buildSettings.HEADER_SEARCH_PATHS = currentPaths;
           console.log(`[withLlamaRnFabricBuildSettings] Updated HEADER_SEARCH_PATHS for configuration: ${buildConfig.name}`);
        } else {
           console.log(`[withLlamaRnFabricBuildSettings] HEADER_SEARCH_PATHS already up-to-date for configuration: ${buildConfig.name}`);
        }

         // Optional: Set COPY_HEADERS_RUN_UNIFDEF if needed, but let's try without it first
         // if (buildConfig.buildSettings.COPY_HEADERS_RUN_UNIFDEF !== 'YES') {
         //   buildConfig.buildSettings.COPY_HEADERS_RUN_UNIFDEF = 'YES';
         //   console.log(`[withLlamaRnFabricBuildSettings] Set COPY_HEADERS_RUN_UNIFDEF=YES for ${buildConfig.name}`);
         // }
      }
    }

    return config;
  });
};

module.exports = withLlamaRnFabricBuildSettings; 