// Popup script for ChatGPT Background Extension
document.addEventListener('DOMContentLoaded', async () => {
  const enableToggle = document.getElementById('enableToggle');
  const status = document.getElementById('status');
  
  // Load current settings
  try {
    const result = await chrome.storage.sync.get({ enabled: true });
    enableToggle.checked = result.enabled;
    updateStatus(result.enabled);
  } catch (error) {
    console.error('Failed to load settings:', error);
    enableToggle.checked = true;
    updateStatus(true);
  }
  
  // Handle toggle changes
  enableToggle.addEventListener('change', async () => {
    const enabled = enableToggle.checked;
    
    try {
      // Save to storage
      await chrome.storage.sync.set({ enabled });
      
      // Send message to content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.url?.includes('chatgpt.com') || tabs[0]?.url?.includes('chat.openai.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'TOGGLE_EXTENSION',
          enabled: enabled
        }).catch(() => {
          // Ignore errors if content script isn't ready
        });
      }
      
      updateStatus(enabled);
    } catch (error) {
      console.error('Failed to save settings:', error);
      // Revert toggle on error
      enableToggle.checked = !enabled;
    }
  });
  
  function updateStatus(enabled) {
    status.textContent = enabled ? 'Extension is active' : 'Extension is disabled';
    status.className = enabled ? 'status enabled' : 'status disabled';
  }
});