import requests
import urllib.parse
import json
import yaml
import time
import os

def run_query(userid, token, jsessionid):
    # Define the base URL and the filter part
    base_url = 'https://performancemanager5.successfactors.eu/localpicture'

    # Construct the full URL
    url = f"{base_url}?ps_p_action=show&ps_p_uid={userid}&p_type=large&_s.crb={token}"
    # p_type: quickcard, large

    # Define headers
    headers = {
        'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'accept-language': 'en-US',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0'
    }

    # Define cookies
    cookies = {
        'JSESSIONID': f"{jsessionid}.pc33bcf36;"
    }

    # Make the request
    response = requests.get(url, headers=headers, cookies=cookies)

    # Return the image data
    if response.status_code != 200:
        print(f"Error: {response.status_code} - {response.text}")
        exit()
    return response.content

if __name__ == '__main__':
    """ Main function to run the queries and concatenate the results.
        To run the queries you need to provide the x-ajax-token header and JSESSIONID cookie.
        You can get these by logging into SuccessFactors, opening the developer tools (F12),
        going to the Network tab, and then refreshing the page. Look for a request to the
        'TeamAbsenceCalendar' endpoint and copy the 'x-ajax-token' header and 'JSESSIONID' cookie.

        The userids are easily gathered from the query requests sent to the database.
    """
    with open('config/config.yaml', 'r') as file:
        config = yaml.safe_load(file)

    # Load the existing holiday data JSON file
    with open('output/holiday_data.json', 'r') as f:
        holiday_data = json.load(f)

    # Extract unique user IDs from the JSON data
    unique_user_ids = {result['userId'] for result in holiday_data['d']['results']}

    # Loop over the list of unique user IDs
    for user_id in unique_user_ids:
        print(f"Processing user ID: {user_id}")

        # Run the initial query
        output_path = f"output/img/{user_id}.jpg"
        # Check if the image already exists
        if os.path.exists(output_path):
            print(f"Image for user ID {user_id} already exists. Skipping...")
            continue
        # Run the query if the image does not exist
        image_data = run_query(user_id, config['token'], config['jsessionid'])
        # Save the image data to a file
        output_path = f"output/img/{user_id}.jpg"
        with open(output_path, 'wb') as img_file:
            img_file.write(image_data)
        # Sleep for 500ms between each query
        time.sleep(1)
