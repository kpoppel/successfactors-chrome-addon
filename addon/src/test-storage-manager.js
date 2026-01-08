// test-storage-manager.js
// Simple test suite for StorageManager
// Run in browser console: await testStorageManager()

import { storageManager, StorageManager } from './storage-manager.js';

export async function testStorageManager() {
    console.log('🧪 Testing StorageManager...\n');
    
    let passed = 0;
    let failed = 0;
    
    function assert(condition, message) {
        if (condition) {
            console.log(`✅ ${message}`);
            passed++;
        } else {
            console.error(`❌ ${message}`);
            failed++;
        }
    }
    
    try {
        // Test 1: Basic set/get
        await storageManager.set('test_key', 'test_value');
        const value = await storageManager.get('test_key');
        assert(value === 'test_value', 'Basic set/get works');
        
        // Test 2: Get with default value
        const defaultValue = await storageManager.get('nonexistent_key', 'default');
        assert(defaultValue === 'default', 'Get with default value works');
        
        // Test 3: Object storage
        const testObj = { foo: 'bar', nested: { value: 42 } };
        await storageManager.set('test_object', testObj);
        const retrieved = await storageManager.get('test_object');
        assert(JSON.stringify(retrieved) === JSON.stringify(testObj), 'Object storage works');
        
        // Test 4: Multiple get/set
        await storageManager.setMultiple({
            key1: 'value1',
            key2: 'value2',
            key3: { complex: true }
        });
        const multiple = await storageManager.getMultiple(['key1', 'key2', 'key3']);
        assert(multiple.key1 === 'value1' && multiple.key2 === 'value2', 'Multiple get/set works');
        
        // Test 5: Has method
        const exists = await storageManager.has('key1');
        const notExists = await storageManager.has('nonexistent');
        assert(exists === true && notExists === false, 'Has method works');
        
        // Test 6: Remove
        await storageManager.remove('key1');
        const removed = await storageManager.get('key1');
        assert(removed === null, 'Remove works');
        
        // Test 7: Remove multiple
        await storageManager.removeMultiple(['key2', 'key3']);
        const removed2 = await storageManager.get('key2');
        assert(removed2 === null, 'Remove multiple works');
        
        // Test 8: Get all keys
        await storageManager.set('test1', 'a');
        await storageManager.set('test2', 'b');
        const keys = await storageManager.getAllKeys();
        assert(keys.includes('test1') && keys.includes('test2'), 'Get all keys works');
        
        // Test 9: Error handling
        let errorCaught = false;
        storageManager.setErrorHandler((error) => {
            errorCaught = true;
        });
        
        // Cleanup
        await storageManager.remove('test_key');
        await storageManager.remove('test_object');
        await storageManager.remove('test1');
        await storageManager.remove('test2');
        
        // Test 10: Custom instance
        const customManager = new StorageManager();
        customManager.backend = 'localStorage';
        await customManager.set('custom_test', 'custom_value');
        const customValue = await customManager.get('custom_test');
        assert(customValue === 'custom_value', 'Custom instance works');
        await customManager.remove('custom_test');
        
        console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
        
        if (failed === 0) {
            console.log('🎉 All tests passed!');
        } else {
            console.error(`⚠️  ${failed} test(s) failed`);
        }
        
        return { passed, failed };
        
    } catch (error) {
        console.error('💥 Test suite crashed:', error);
        return { passed, failed: failed + 1 };
    }
}

// Auto-run if loaded in console
if (typeof window !== 'undefined') {
    window.testStorageManager = testStorageManager;
    console.log('💡 Run tests with: await testStorageManager()');
}
