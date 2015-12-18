set -e

git status | grep -q 'On branch master' ||
    { echo 'Must be on master branch.' >&2; exit 1; }
git diff HEAD | grep -q . &&
    { echo 'Please commit changes.' >&2; exit 1; }

rm -f jspbt.{js,srcmap}
git checkout gh-pages
git reset --hard master

make

git add jspbt.{js,srcmap}
git commit -am compile
git push -f origin gh-pages

git checkout master
