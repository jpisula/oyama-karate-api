const path = require('path');
const fs = require('fs');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const checkIfFileIsImage = require('../utils/imageFiles');
const uuid = require('uuid');
const db = require('../utils/db');
const { group } = require('console');

// @desc      Get all sections
// @route     GET /api/v1/sections
// @access    Public
exports.getSections = asyncHandler(async (req, res, next) => {
  const sql = 'SELECT * FROM Sections';

  db.query(sql, (err, result) => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    }

    res.status(201).json({
      success: true,
      count: result.length,
      data: result
    });
  });
});

// @desc      Get all sections labels and names
// @route     GET /api/v1/sections/labels
// @access    Public
exports.getSectionsLabelsAndNames = asyncHandler(async (req, res, next) => {
  const sql = 'SELECT id, label, name FROM Sections';

  const resolve = (err, result) => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    }

    res.status(201).json({
      success: true,
      count: result.length,
      data: result
    });
  };

  db.query(sql, resolve);
});

// @desc      Get single section
// @route     GET /api/v1/sections/:id
// @access    Public
exports.getSection = asyncHandler(async (req, res, next) => {
  let sql = `SELECT * FROM Sections s WHERE s.id='${req.params.id}'`;
  const sectionData = await new Promise((resolve, reject) => {
    db.query(sql, (err, result) => {
      if (err) {
        return next(new ErrorResponse(err, 500));
      } else if (!result.length) {
        return next(new ErrorResponse('Section not found', 404));
      }

      resolve(result);
    });
  });

  sql = `SELECT groupName, id FROM SectionsGroup WHERE sectionId='${req.params.id}'`;
  const sectionGroups = await new Promise((resolve, reject) => {
    db.query(sql, (err, result) => {
      if (err) {
        return next(new ErrorResponse(err, 500));
      }

      resolve(result);
    });
  });

  sectionData[0].groups = [];

  for (const group of sectionGroups) {
    const groupList = {
      id: group.id,
      groupName: group.groupName,
      schedule: []
    };

    sql = `SELECT id, day, hours FROM SectionsGroupSchedule WHERE sectionsGroupId='${group.id}'`;
    const sectionGroupsSchedule = await new Promise((resolve, reject) => {
      db.query(sql, (err, result) => {
        if (err) {
          return next(new ErrorResponse(err, 500));
        } else if (!result.length) {
          resolve([]);
        }

        resolve(result);
      });
    });

    for (const schedule of sectionGroupsSchedule) {
      groupList.schedule.push({
        id: schedule.id,
        hours: schedule.hours,
        day: schedule.day
      });
    }

    sectionData[0].groups.push(groupList);
  }

  res.status(201).json({
    success: true,
    data: { ...sectionData[0] }
  });
});

// @desc      Create new section
// @route     POST /api/v1/sections
// @access    Private
exports.createSection = asyncHandler(async (req, res, next) => {
  const sql = 'INSERT INTO Sections SET ?';

  req.body.id = uuid.v1().split('-').join('');

  const resolve = (err, result) => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    }

    res.status(201).json({
      success: true,
      data: req.body
    });
  };

  db.queryWithParams(sql, req.body, resolve);
});

// @desc      Update section
// @route     PUT /api/v1/sections/:id
// @access    Private
exports.updateSection = asyncHandler(async (req, res, next) => {
  const update = () => {
    sql = `UPDATE Sections SET ? WHERE id='${req.params.id}'`;

    const resolveUpdate = (err, result) => {
      if (err) {
        return next(new ErrorResponse(err, 500));
      }

      res.status(201).json({
        success: true,
        data: req.body
      });
    };

    db.queryWithParams(sql, req.body, resolveUpdate);
  };

  doSectionExistProtectedAction(next, req.params.id, update);
});

// @desc      Delete section
// @route     DELETE /api/v1/sections/:id
// @access    Private
exports.deleteSection = asyncHandler(async (req, res, next) => {
  let sql = `SELECT * FROM Sections WHERE id='${req.params.id}'`;
  const section = await new Promise((resolve, reject) => {
    db.query(sql, (err, result) => {
      if (err) {
        return next(new ErrorResponse(err, 500));
      } else if (!result.length) {
        return next(new ErrorResponse('Section not found', 404));
      }

      resolve(result);
    });
  });

  sql = `DELETE FROM SectionsGroupSchedule WHERE sectionId='${req.params.id}'`;
  await new Promise((resolve, reject) => {
    db.query(sql, (err, result) => {
      if (err) {
        return next(new ErrorResponse(err, 500));
      }

      resolve();
    });
  });

  sql = `DELETE FROM SectionsGroup WHERE sectionId='${req.params.id}'`;
  db.query(sql, (err, result) => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    }

    res.status(201).json({
      success: true,
      data: {}
    });
  });

  if (
    fs.existsSync(
      `${process.env.FILE_UPLOAD_PATH}/photos/sections/${section[0].bigImgUrl}`
    )
  ) {
    fs.unlinkSync(
      `${process.env.FILE_UPLOAD_PATH}/photos/sections/${section[0].bigImgUrl}`
    );
  }
  if (
    fs.existsSync(
      `${process.env.FILE_UPLOAD_PATH}/photos/sections/${section[0].smallImgUrl}`
    )
  ) {
    fs.unlinkSync(
      `${process.env.FILE_UPLOAD_PATH}/photos/sections/${section[0].smallImgUrl}`
    );
  }

  sql = `DELETE FROM Sections WHERE id='${req.params.id}'`;
  db.query(sql, (err, result) => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    }

    res.status(201).json({
      success: true,
      data: {}
    });
  });
});

// @desc      Upload photos for sections
// @route     PUT /api/v1/sections/:id/photo
// @access    Private
exports.sectionPhotoUpload = asyncHandler(async (req, res, next) => {
  const upload = () => {
    if (!req.files) {
      return next(new ErrorResponse(`Please upload a file`, 400));
    }

    const bigImage = req.files.bigImg;
    const smallImage = req.files.smallImg;

    checkIfFileIsImage([bigImage, smallImage]);

    // Create custom filename
    bigImage.name = `photo_${req.params.id}_big${
      path.parse(bigImage.name).ext
    }`;
    smallImage.name = `photo_${req.params.id}_small${
      path.parse(smallImage.name).ext
    }`;

    // Move files to their folder
    bigImage.mv(
      `${process.env.FILE_UPLOAD_PATH}/photos/sections/${bigImage.name}`,
      async (err) => {
        if (err) {
          console.error(err);
          return next(
            new ErrorResponse(`Problem with file upload: ${err}`, 500)
          );
        }
      }
    );

    smallImage.mv(
      `${process.env.FILE_UPLOAD_PATH}/photos/sections/${smallImage.name}`,
      async (err) => {
        if (err) {
          console.error(err);
          return next(new ErrorResponse(`Problem with file upload`, 500));
        }
      }
    );

    const queryParams = {
      bigImgUrl: bigImage.name,
      smallImgUrl: smallImage.name,
      bigImgAlt: req.body.bigImgAlt,
      smallImgAlt: req.body.smallImgAlt
    };

    sql = `UPDATE Sections SET ? WHERE id='${req.params.id}'`;

    const resolveUpdate = (err, result) => {
      if (err) {
        return next(new ErrorResponse(err, 500));
      }

      res.status(201).json({
        success: true,
        data: result
      });
    };

    db.queryWithParams(sql, queryParams, resolveUpdate);
  };

  doSectionExistProtectedAction(next, req.params.id, upload);
});

const doSectionExistProtectedAction = async (next, id, action) => {
  const sql = `SELECT * FROM Sections WHERE id='${id}'`;

  const resolve = (err, result) => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    } else if (!result.length) {
      return next(new ErrorResponse('Section not found', 404));
    }

    action();
  };

  db.query(sql, resolve);
};
