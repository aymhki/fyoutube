chrome.runtime.onInstalled.addListener(() => {
    console.log('YouTube Algorithm Reset extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'statusUpdate') {
        chrome.runtime.sendMessage(request).catch(() => {

        });
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        }).catch(err => {
            console.log('Content script injection result:', err.message || 'Already injected');
        });
    }
});
