import requests
import urllib.parse
import json
import yaml

def get_hierarchy(userid, token, jsessionid):
    """ Get the hierarchy of a user ID.  Not that useful here as we can get the user ids from the holiday data anyhow. """
    # Define the base URL and the filter part
    base_url = 'https://performancemanager5.successfactors.eu/odata/v2/restricted/TeamAbsences,TeamAbsenceCalendar,TeamAbsenceCalendarUserConfig/TeamAbsenceCalendar'
    skip = 0
    top = 5000
    filter_part = f"hierarchyLevel eq 0 and (userId eq '{userid}' and userGroup eq 'HIERARCHY')"
    select = "userGroup,username,userId,parentNodeID,drillState,totalCount,orderedFilterTeamMemberIds,hierarchyLevel"

    # URL encode the filter part
    encoded_filter = urllib.parse.quote(filter_part)

    # Construct the full URL
    url = f"{base_url}?&$filter={encoded_filter}&$select={select}&$skip={skip}&$top={top}&$inlinecount=allpages"

    # Define headers
    headers = {
        'accept': 'application/json',
        'accept-language': 'en-US',
        'x-ajax-token': token,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0'
    }

    # Define cookies
    cookies = {
        'JSESSIONID': jsessionid
    }

    # Make the request
    response = requests.get(url, headers=headers, cookies=cookies)

    # Return the response as a dictionary
    if response.status_code != 200:
        print(response.text)
        exit()
    print(response.text)
    return response.json()


def run_query(userid, fromdate, todate, include_self, token, jsessionid):
    # Define the base URL and the filter part
    base_url = 'https://performancemanager5.successfactors.eu/odata/v2/restricted/TeamAbsences,TeamAbsenceCalendar,TeamAbsenceCalendarUserConfig/TeamAbsenceCalendar'
    if include_self:
        filter_part = f"userId eq '{userid}' and (userGroup eq 'SELECTED_USER' or userGroup eq 'DIRECT_REPORT') and skipJobInfoRead eq false and viewKey eq 'keyMonthView'"
    else:
        filter_part = f"userId eq '{userid}' and userGroup eq 'DIRECT_REPORT' and skipJobInfoRead eq false and viewKey eq 'keyMonthView'"
    
    ## Keepme: filter_part = "userId eq '"+userid+"' and (userGroup eq 'SELECTED_USER' or userGroup eq 'DIRECT_REPORT') and skipJobInfoRead eq false and viewKey eq 'keyMonthView'"
    ## Valid keywords are: DIRECT_REPORT, MANAGER,PEER and SELECTED_USER
    ## MANAGER: The direct manager of the userid
    ## DIRECT_REPORT: All direct reports of the userid
    ## PEER: All peers of the userid
    ## SELECTED_USER: The userid

    # URL encode the filter part
    encoded_filter = urllib.parse.quote(filter_part)

    # Construct the full URL
    #select = "nonWorkingDates,skipJobInfoRead,userGroup,username,userId,holidays,workSchedule,employeeTimeNav/externalCode,employeeTimeNav/startTime,employeeTimeNav/startDate,employeeTimeNav/endDate,employeeTimeNav/endTime,employeeTimeNav/undeterminedEndDate,employeeTimeNav/quantityInDays,employeeTimeNav/quantityInHours,employeeTimeNav/userId,employeeTimeNav/flexibleRequesting,employeeTimeNav/displayQuantity,employeeTimeNav/physicalStartDate,employeeTimeNav/physicalEndDate,employeeTimeNav/leaveOfAbsence,employeeTimeNav/timeTypeUnit,employeeTimeNav/timeTypeName,employeeTimeNav/approvalStatus"
    #select = "nonWorkingDates,username,userId,holidays,employeeTimeNav/startDate,employeeTimeNav/endDate,employeeTimeNav/quantityInDays,employeeTimeNav/leaveOfAbsence,employeeTimeNav/approvalStatus"
    select = "nonWorkingDates,skipJobInfoRead,userGroup,username,userId,holidays,workSchedule,employeeTimeNav/externalCode,employeeTimeNav/startTime,employeeTimeNav/startDate,employeeTimeNav/endDate, employeeTimeNav/endTime,employeeTimeNav/undeterminedEndDate,employeeTimeNav/quantityInDays, employeeTimeNav/quantityInHours,employeeTimeNav/userId,employeeTimeNav/flexibleRequesting,employeeTimeNav/displayQuantity,employeeTimeNav/physicalStartDate,employeeTimeNav/physicalEndDate,employeeTimeNav/leaveOfAbsence,employeeTimeNav/timeTypeUnit, employeeTimeNav/timeTypeName,employeeTimeNav/approvalStatus"
    # nonWorkingDates = public holidays, weekends, etc.
    # employeeTimeNav = absences it is a list
    skip = 0
    top = 5000
    url = f"{base_url}?$skip={skip}&$top={top}&$filter={encoded_filter}&$select={select}&$expand=employeeTimeNav&fromDate="+fromdate+"&toDate="+todate

    # Define headers
    headers = {
        'accept': 'application/json',
        'accept-language': 'en-US',
        'x-ajax-token': token,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0'
    }

    # Define cookies
    cookies = {
        'JSESSIONID': f"{jsessionid}.pc33bcf36;"
    }

    # Make the request
    response = requests.get(url, headers=headers, cookies=cookies)

    # Return the response as a dictionary
    if response.status_code != 200:
        print(response.text)
        exit()
    #print(response.text)
    return response.json()

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

    # Run the initial query
    initial_data = run_query(config['initial_userid'], config['from_date'], config['to_date'], True, config['token'], config['jsessionid'])
    json.dumps(initial_data, indent=4)

    # Initialize the concatenated results
    concatenated_results = initial_data['d']['results']

    for userid in config['more_userids']:
        user_data = run_query(userid, config['from_date'], config['to_date'], False, config['token'], config['jsessionid'])
        concatenated_results.extend(user_data['d']['results'])

    # Loop over all user IDs in the initial data and query them
    # (This version uses any user ids found in the initial data)
    # for result in initial_data['d']['results']:
    #     userid = result['userId']
    #     if userid == initial_userid:
    #         continue
    #     print(userid)
    #     user_data = run_query(userid, fromdate, todate, False, token, jsessionid)
    #     concatenated_results.extend(user_data['d']['results'])

    #print(concatenated_results)

    # # Create the final data dictionary
    final_data = {'d': {'results': concatenated_results}}

    # # Dump the concatenated results to a JSON file
    with open('output/holiday_data.json', 'w') as f:
        json.dump(final_data, f, indent=4)
