# HYDIE

How's Your Development Involvement and Engagement

## Setup

1. run `git clone https://github.com/iamthe-Wraith/hydie.git`

2. run `cd hydie`

3. run `npm install`

4. run `cp .env.example .env`

5. add the required environment variables to the new .env file (see [Environment Variables](#environment-variables))

6. run `npm run dev`

7. open you browser and visit `http://localhost:5173/`

## Environment Variables

Below are instructions on where to find the values you'll need for your environment variables.

### `GITHUB_OWNER`

The username or organization name of the owner of the repo to pull data from.

If the repo is owned by an individual user, you can find their name in their url. Visit the user's GitHub profile and copy the url. Mine is `https://github.com/iamthe-Wraith`. Now copy the value found after `https://github.com` and remove any leading or trailing `/`'s. This is the value to set for the `GITHUB_OWNER` environment variable.

If the repo is owned by an organization, the process is the same. Go to the organization's GitHub profile and copy the url. One of my organization's urls is `https://github.com/BuzyBee-Buzz/`. Now copy the value found after `https://github.com` and remove any leading or trailing `/`'s. This is the value to set for the `GITHUB_OWNER` environment variable.

### `GITHUB_REPO`

The name of the GitHub repository to pull data from.

To find this value, visit the repo in the browser and copy the url. The url for this repo is `https://github.com/iamthe-Wraith/hydie`...that end part (`hydie`) is the name of the repo.

### `GITHUB_TOKEN`

This is your access token that will grant your requests access. To create an access token...

1. login to GitHub
2. navigate to `https://github.com/settings/personal-access-tokens`
3. click `Generate new token`
4. give the access token a name. this will help you to identify your access tokens later, so make it clear what the token is to be used for.
5. set the `Resource owner`. if the repo is owned by an organization, you will likely need to change this value to the organization's name. otherwise, set this to your username.
6. set an `Expiration`
7. for `Repository access`, I personally prefer to use `Only select repositories` and select only the repo i'll be accessing, but select the option that's best for your personal use case.
8. under `Permissions`, expand the `Repository permissions` details
9. find the `Pull requests` option and set it's value to `Read-only`
10. NOTE...this will automatically set `Metadata` to `Read-only` as well. The required and expected.
11. scroll to the bottom of the page and click `Generate token`
12. copy the personal access token once it's displayed in the UI (make sure to do this, once you leave the page you cannot access this token again and will have to re-generate the token)
13. paste the personal access token as the value for the `GITHUB_TOKEN` environment variable

_💾 Don't forget to Save the changes you make to the `.env` file._
