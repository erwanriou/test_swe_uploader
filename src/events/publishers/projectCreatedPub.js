const { Publisher, Subject } = require("test_swe_common")

// CHILDREN CLASS
class ProjectCreatedPub extends Publisher {
  subject = Subject.PROJECT_UPLOADER_CREATED
}

exports.ProjectCreatedPub = ProjectCreatedPub
