export function useTopics(
  topicModel?: TopicModel,
  channelManager?: ChannelManager,
  limit: number = 10,
  includeSystemTopics: boolean = true
): TopicListItem[] {
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const oneContext = useModel();
  const model = oneContext?.model;
  const isReady = useModelState().isReady;

  useEffect(() => {
    // Critical fix: Load topics even if isReady is false but we have the models
    if (!topicModel || !channelManager || !model) {
      console.log('[useTopics] Missing dependencies:', {
        hasTopicModel: !!topicModel,
        hasChannelManager: !!channelManager,
        isReady,
        hasModel: !!model
      });
      return;
    }

    console.log('[useTopics] Loading topics with model and dependencies available');

    const loadTopics = async () => {
      try {
        // Get all topic rooms
        console.log('[useTopics] Calling topicModel.getAllTopicRooms()');
        const rooms = await topicModel.getAllTopicRooms();
        console.log('[useTopics] Topic rooms result:', rooms ? `Found ${Object.keys(rooms).length} rooms` : 'No rooms found');
        
        // Even if no rooms are found yet, continue to check and load system topics
        
        // Check for system topics specifically (EveryoneTopic and GlueTopic)
        console.log('[useTopics] Checking for system topics in model');
        console.log('[useTopics] model.everyoneTopic available:', !!model.everyoneTopic);
        console.log('[useTopics] model.glueTopic available:', !!model.glueTopic);
        console.log('[useTopics] includeSystemTopics:', includeSystemTopics);
      } catch (error) {
        console.error('[useTopics] Error loading topics:', error);
      }
    };

    loadTopics();
  }, [topicModel, channelManager, model, includeSystemTopics]);

  return topics;
} 