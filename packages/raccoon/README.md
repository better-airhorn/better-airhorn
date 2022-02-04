# recommendationRaccoon (raccoon)

[![codecov](https://codecov.io/gh/maruware/recommendationRaccoon/branch/master/graph/badge.svg)](https://codecov.io/gh/maruware/recommendationRaccoon)
[![Actions Status](https://github.com/maruware/recommendationRaccoon/workflows/test/badge.svg)](https://github.com/maruware/recommendationRaccoon/actions)

An easy-to-use collaborative filtering based recommendation engine and NPM module built on top of Node.js and Redis. The engine uses the Jaccard coefficient to determine the similarity between users and k-nearest-neighbors to create recommendations. This module is useful for anyone with users, a store of products/movies/items, and the desire to give their users the ability to like/dislike and receive recommendations based on similar users. Raccoon takes care of all the recommendation and rating logic. It can be paired with any database as it does not keep track of any user/item information besides a unique ID.

Updated for ES6.

**Forked [guymorita/recommendationRaccoon](https://github.com/guymorita/recommendationRaccoon)**
̷**Copy by Clemens Ertle from [maruware/recommendationRaccoon](https://github.com/maruware/recommendationRaccoon) with only minor adjustments**
## Requirements

* Node.js 11.x
* Redis

## Install

```bash
npm install @better-airhorn/raccoon
```

## Usage

Raccoon keeps track of the ratings and recommendations from your users. It does not need to store any meta data of the user or product aside from an id. To get started:

```ts
import Raccoon from '@better-airhorn/raccoon'

async () => {
  const raccoon = new Raccoon({
    className: 'movie',
    redisUrl: 'YOUR_REDIS_URL'
  })
  await raccoon.liked('garyId', 'movieId')
  await raccoon.liked('garyId', 'movie2Id')
  await raccoon.liked('chrisId', 'movieId')
  const recs = await raccoon.recommendFor('chrisId', 10)
  console.log('recs', recs)
  // results will be an array of x ranked recommendations for chris
  // in this case it would contain movie2
}

```

## Full Usage

### Likes:
``` js
raccoon.liked('userId', 'itemId').then(() => {
});
// after a user likes an item, the rating data is immediately
// stored in Redis in various sets for the user/item, then the similarity,
// wilson score and recommendations are updated for that user.
```

``` js
raccoon.liked('userId', 'itemId', options).then(() => {
});
// available options are:
{
  updateRecs: false
    // this will stop the update sequence for this rating
    // and greatly speed up the time to input all the data
    // however, there will not be any recommendations at the end.
    // if you fire a like/dislike with updateRecs on it will only update
    // recommendations for that user.
    // default === true
}

// options are available to liked, disliked, unliked, and undisliked.

```

``` js
raccoon.unliked('userId', 'itemId').then(() => {
});
// removes the liked rating from all sets and updates. not the same as disliked.
```

### Dislikes:
``` js
raccoon.disliked('userId', 'itemId').then(() => {
});
// negative rating of the item. if user1 liked movie1 and user2 disliked it, their
// jaccard would be -1 meaning the have opposite preferences.
```

``` js
raccoon.undisliked('userId', 'itemId').then(() => {
});
// similar to unliked. removes the negative disliked rating as if it was never rated.
```

### Recommendations

``` js
raccoon.recommendFor('userId', 'numberOfRecs').then((results) => {
  // returns an ranked sorted array of itemIds which represent the top recommendations
  // for that individual user based on knn.
  // numberOfRecs is the number of recommendations you want to receive.
  // asking for recommendations queries the 'recommendedZSet' sorted set for the user.
  // the movies in this set were calculated in advance when the user last rated
  // something.
  // ex. results = ['batmanId', 'supermanId', 'chipmunksId']
});

raccoon.mostSimilarUsers('userId').then((results) => {
  // returns an array of the 'similarityZSet' ranked sorted set for the user which
  // represents their ranked similarity to all other users given the
  // Jaccard Coefficient. the value is between -1 and 1. -1 means that the
  // user is the exact opposite, 1 means they're exactly the same.
  // ex. results = ['garyId', 'andrewId', 'jakeId']
});

raccoon.leastSimilarUsers('userId').then((results) => {
  // same as mostSimilarUsers but the opposite.
  // ex. results = ['timId', 'haoId', 'phillipId']
});
```

### User Statistics

### Ratings:
``` js
raccoon.bestRated().then((results) => {
  // returns an array of the 'scoreboard' sorted set which represents the global
  // ranking of items based on the Wilson Score Interval. in short it represents the
  // 'best rated' items based on the ratio of likes/dislikes and cuts out outliers.
  // ex. results = ['iceageId', 'sleeplessInSeattleId', 'theDarkKnightId']
});

raccoon.worstRated().then((results) => {
  // same as bestRated but in reverse.
});
```

### Liked/Disliked lists and counts:
``` js
raccoon.mostLiked().then((results) => {
  // returns an array of the 'mostLiked' sorted set which represents the global
  // number of likes for all the items. does not factor in dislikes.
});

raccoon.mostDisliked().then((results) => {
  // same as mostLiked but the opposite.
});

raccoon.likedBy('itemId').then((results) => {
  // returns an array which lists all the users who liked that item.
});

raccoon.likedCount('itemId').then((results) => {
  // returns the number of users who have liked that item.
});

raccoon.dislikedBy('itemId').then((results) => {
  // same as likedBy but for disliked.
});

raccoon.dislikedCount('itemId').then((results) => {
  // same as likedCount but for disliked.
});

raccoon.allLikedFor('userId').then((results) => {
  // returns an array of all the items that user has liked.
});

raccoon.allDislikedFor('userId').then((results) => {
  // returns an array of all the items that user has disliked.
});

raccoon.allWatchedFor('userId').then((results) => {
  // returns an array of all the items that user has liked or disliked.
});
```


## Recommendation Engine Components

### Jaccard Coefficient for Similarity

There are many ways to gauge the likeness of two users. The original implementation of recommendation Raccoon used the Pearson Coefficient which was good for measuring discrete values in a small range (i.e. 1-5 stars). However, to optimize for quicker calcuations and a simplier interface, recommendation Raccoon instead uses the Jaccard Coefficient which is useful for measuring binary rating data (i.e. like/dislike). Many top companies have gone this route such as Youtube because users were primarily rating things 4-5 or 1. The choice to use the Jaccard's instead of Pearson's was largely inspired by David Celis who designed Recommendable, the top recommendation engine on Rails. The Jaccard Coefficient also pairs very well with Redis which is able to union/diff sets of like/dislikes at O(N).

### K-Nearest Neighbors Algorithm for Recommendations

To deal with large user bases, it's essential to make optimizations that don't involve comparing every user against every other user. One way to deal with this is using the K-Nearest Neighbors algorithm which allows you to only compare a user against their 'nearest' neighbors. After a user's similarity is calculated with the Jaccard Coefficient, a sorted set is created which represents how similar that user is to every other. The top users from that list are considered their nearest neighbors. recommendation Raccoon uses a default value of 5, but this can easily be changed based on your needs.

### Wilson Score Confidence Interval for a Bernoulli Parameter

If you've ever been to Amazon or another site with tons of reviews, you've probably ran into a sorted page of top ratings only to find some of the top items have only one review. The Wilson Score Interval at 95% calculates the chance that the 'real' fraction of positive ratings is at least x. This allows for you to leave off the items/products that have not been rated enough or have an abnormally high ratio. It's a great proxy for a 'best rated' list.

### Redis

When combined with hiredis, redis can get/set at ~40,000 operations/second using 50 concurrent connections without pipelining. In short, Redis is extremely fast at set math and is a natural fit for a recommendation engine of this scale. Redis is integral to many top companies such as Twitter which uses it for their Timeline (substituted Memcached).



## Features to Contribute

* Help optimize for the Movielens 100k data set. Here: https://github.com/guymorita/benchmark_raccoon_movielens

## Run tests

``` bash
yarn test
```

## Tech Stack

recommendationRaccoon is written fully in Javascript. It utilizes the asyncronous, non-blocking features of Node.js for the core of app. The recommendations and ratings are stored in an intermediate data store called Redis which performs extremely well compared to database systems that write every change to disk before committing the transaction. Redis holds the entire dataset in memory. For the actual handling of the parallel asyncronous functions, raccoon uses the async library for Node.js.

For testing, raccoon uses Mocha Chai as a testing suite, automates it with Grunt.js and gets test coverage with Blanket.js/Travis-CI/Coveralls.

## Links

* Code: 'git clone git://github.com/guymorita/recommendationRaccoon.git'
* NPM Module(Original): 'https://npmjs.org/package/raccoon'
* Benchmark / Performance repo: 'https://github.com/guymorita/benchmark_raccoon_movielens'
* Demo / UI App repo: 'https://github.com/guymorita/Mosaic-Films---Recommendation-Engine-Demo'
