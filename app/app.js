import unirest from 'unirest';
import fse from 'fs-extra';
import path from 'path';
import program from 'commander';
import config from '../config';
import { getDefaultFileName } from './utils';
import { createHeader } from './header';
import YonaExport from './YonaExport';

const yonaProjectExportUrl = config.YONA.FROM.SERVER + '/-_-api/v1'
    + '/owners/' + config.YONA.FROM.OWNER_NAME
    + '/projects/' + config.YONA.FROM.PROJECT_NAME
    + '/exports';

const main = (from, to) => {

  if( getOptions() === 'export' ){
    console.log(`start exporting from ${from.OWNER_NAME}/${from.PROJECT_NAME}`);
    exportFrom();
  }
  if( getOptions() === 'import' ){
    console.log(`start importing to ${to.OWNER_NAME}/${to.PROJECT_NAME}`);
    importTo();
  }
};

main(config.YONA.FROM, config.YONA.TO);

function getOptions(){
  program.parse(process.argv);

  if(program.args && program.args.length > 0) {
    return program.args[0];
  }
}

function importTo() {
  const from = config.YONA.FROM;
  const to = config.YONA.TO;
  const exportedFile = path.join('exported/',
      from.OWNER_NAME,
      from.PROJECT_NAME + '.json');
  console.log(exportedFile);
  const exportedData = JSON.parse(fse.readFileSync(exportedFile, 'utf8'));

  const project = parseProject(exportedData, to);
  const users = parseRequiredUsers(project);

  const yonaExport = new YonaExport();

  const apiUrl = {
    users: to.SERVER + '/-_-api/v1/users',
    projects: to.SERVER + `/-_-api/v1/owners/${to.OWNER_NAME}/projects`,
    milestones: to.SERVER + `/-_-api/v1/owners/${to.OWNER_NAME}/projects/${to.PROJECT_NAME}/milestones`,
    issues: to.SERVER + `/-_-api/v1/owners/${to.OWNER_NAME}/projects/${to.PROJECT_NAME}/issues`,
    posts: to.SERVER + `/-_-api/v1/owners/${to.OWNER_NAME}/projects/${to.PROJECT_NAME}/posts`
  };



  yonaExport.importData(users, apiUrl.users, () =>
      yonaExport.importData(project, apiUrl.projects, () =>
          yonaExport.importData({ milestones: exportedData.milestones }, apiUrl.milestones, () => {
            pushIssues(exportedData, () => {
              pushPostings(exportedData);
            });
          })
      ));
}

function pushPostings(exportedData, cb) {
  const yonaExport = new YonaExport();
  let counter = 0;
  exportedData.posts.forEach(posting => {
    counter++;
    setTimeout(() => {
      yonaExport.pushFiles(posting, null, response => {
        if (response.status === 201) {
          posting.number = response.body[0].location.split('/').pop();
          if (posting.comments && posting.comments.length > 0) {
            pushComments(posting);
          }
        }
      });
    }, counter * 500);
    if (!exportedData.posts || counter === exportedData.posts.length) {
      if(cb) cb();
    }
  });
}

function pushIssues(exportedData, cb) {
  const yonaExport = new YonaExport();
  let counter = 0;
  exportedData.issues.forEach(issue => {
    counter++;
    setTimeout(() => {
      yonaExport.pushFiles(issue, null, response => {
        if (response.status === 201) {
          issue.number = response.body[0].location.split('/').pop();
          if (issue.comments && issue.comments.length > 0) {
            pushComments(issue);
          }
        }
      });
    }, counter * 500);
    if (!exportedData.issues || counter === exportedData.issues.length) {
      if(cb) cb();
    }
  });
}

function pushComments (item) {
  const yonaExport = new YonaExport();
  let commentCounter = 0;

  item.comments.forEach(comment => {
    commentCounter++;
    setTimeout(() => {
      yonaExport.pushFiles(comment, item, response => {
        console.log(response.body);
      })
    }, commentCounter * 300);
  })
}

function parseRequiredUsers(project) {
  return { users: [...project.members, ...project.authors, ...project.assignees] }
}

function parseProject(source, to) {
  return {
    owner: to.OWNER_NAME,
    projectName: to.PROJECT_NAME,
    projectDescription: source.projectDescription,
    projectCreatedDate: source.projectCreatedDate,
    projectVcs: source.projectVcs,
    projectScope: source.projectScope,
    assignees: source.assignees,
    authors: source.authors,
    members: source.members,
    labels: source.labels
  }
}

function exportFrom() {
  unirest.get(yonaProjectExportUrl)
      .headers({
        'Accept': 'application/json',
        'Yona-Token': config.YONA.FROM.USER_TOKEN
      })
      .end(response => {
        if (isBadResponse(response.status)) {
          console.log('오류 발생!! HTTP 응답코드를 확인하세요! ', yonaProjectExportUrl, response.status, response.statusMessage);
          process.exit(1);
        }
        const exportDir = path.join(
            config.EXPORT_BASE_DIR,
            config.YONA.FROM.OWNER_NAME,
            config.YONA.FROM.PROJECT_NAME,
        );

        writeItems(response.body.issues, path.join(exportDir, '/issues/'));
        writeItems(response.body.posts, path.join(exportDir, '/posts/'));
        writeItems(response.body.milestones, path.join(exportDir, '/milestones/'));

        writeOriginalJson(response.body, exportDir);
      });
}


function isBadResponse(statusCode) {
  return [200, 201].indexOf(statusCode) === -1;
}

function writeOriginalJson(item, exportDir, cb) {
  fse.outputFile(`${exportDir}.json`, JSON.stringify(item), err => {
    if (err) console.error(err);
    if(cb) cb();
  })
}

function writeItems(items, exportDir) {
  items.forEach(item => {
    fse.outputFile(`${exportDir}${getDefaultFileName(item)}`, createHeader(item), err => {
      if (err) console.error(err);
    })
  });
}
